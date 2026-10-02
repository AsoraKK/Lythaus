// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';
import 'package:lythaus/features/feed/application/owner_content_repository.dart';

class CommentThreadScreen extends ConsumerStatefulWidget {
  const CommentThreadScreen({
    super.key,
    required this.postId,
    this.initialCommentId,
    this.canSubmit = true,
  });

  final String postId;
  final String? initialCommentId;
  final bool canSubmit;

  @override
  ConsumerState<CommentThreadScreen> createState() =>
      _CommentThreadScreenState();
}

class _CommentThreadScreenState extends ConsumerState<CommentThreadScreen> {
  final TextEditingController _composerController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _composerFocusNode = FocusNode();

  List<_ThreadComment> _comments = const [];
  String? _nextCursor;
  bool _isInitialLoading = true;
  bool _isLoadingMore = false;
  bool _isSubmitting = false;
  bool _confirmingDeletion = false;
  String? _errorMessage;
  _ThreadComment? _replyTarget;
  String? _pendingParentId;
  String? _aiLabel;
  bool _locked = false;
  int _loadEpoch = 0;
  int _sessionEpoch = 0;
  late String _actor;
  String get _createScope => 'comment-create:$_actor:${widget.postId}';
  bool _restoring = false;
  String? _draftStatus;
  int _draftVersion = 0;
  ProviderSubscription<String?>? _sessionSub;
  Future<void> Function()? _retryAction;
  final _locallySubmitted = <String>{};

  @override
  void initState() {
    super.initState();
    _actor = ref.read(currentUserProvider)?.id ?? 'session';
    final pending = ref
        .read(contentMutationRegistryProvider)
        .pending(_createScope);
    if (pending != null) {
      _composerController.text = pending.payload['body'] as String? ?? '';
      _aiLabel = pending.payload['declaredCreationMode'] == 'ai_assisted'
          ? 'assisted'
          : 'human';
      _pendingParentId = pending.payload['parentId'] as String?;
      _locked = true;
    }
    _scrollController.addListener(_onScroll);
    _sessionSub = ref.listenManual(
      currentUserProvider.select((user) => user?.id),
      (previous, next) {
        if ((next ?? 'session') == _actor) return;
        ++_loadEpoch;
        ++_sessionEpoch;
        ++_draftVersion;
        _actor = next ?? 'session';
        _composerController.clear();
        _locallySubmitted.clear();
        setState(() {
          _comments = const [];
          _replyTarget = null;
          _pendingParentId = null;
          _aiLabel = null;
          _locked = false;
          _isSubmitting = false;
          _restoring = false;
          _confirmingDeletion = false;
          _errorMessage = null;
          _draftStatus = null;
        });
        unawaited(_restoreComposer());
        unawaited(_loadInitial());
      },
    );
    unawaited(_restoreComposer());
    Future<void>.microtask(_loadInitial);
  }

  Future<void> _restoreComposer() async {
    if (_actor == 'session') return;
    _restoring = true;
    final actor = _actor;
    final version = _draftVersion;
    final registry = ref.read(contentMutationRegistryProvider);
    await registry.refresh();
    if (!mounted || actor != _actor || version != _draftVersion) return;
    final pending = registry.pending(_createScope);
    final data = pending != null && !pending.needsReentry
        ? pending.payload
        : registry.draft(_createScope);
    setState(() {
      _restoring = false;
      if (data != null) {
        _composerController.text = data['body'] as String? ?? '';
        _pendingParentId = data['parentId'] as String?;
        _aiLabel = data['declaredCreationMode'] == 'ai_assisted'
            ? 'assisted'
            : data['declaredCreationMode'] == 'human'
            ? 'human'
            : null;
      }
      _locked = pending != null && !pending.needsReentry;
      _draftStatus = pending?.needsReentry == true
          ? 'Re-enter the same text, disclosure and reply target to check the previous request.'
          : data == null
          ? null
          : 'Draft restored on this device.';
      if (pending?.needsReentry == true) {
        _pendingParentId = pending!.payload['parentId'] as String?;
        _aiLabel = pending.payload['declaredCreationMode'] == 'ai_assisted'
            ? 'assisted'
            : 'human';
      }
    });
  }

  void _saveDraft() {
    final actor = _actor;
    final version = ++_draftVersion;
    setState(() => _draftStatus = 'Saving draft…');
    unawaited(
      ref
          .read(contentMutationRegistryProvider)
          .saveDraft(
            _createScope,
            _composerController.text.isEmpty
                ? null
                : {
                    'body': _composerController.text,
                    'declaredCreationMode': _aiLabel == 'assisted'
                        ? 'ai_assisted'
                        : _aiLabel == 'human'
                        ? 'human'
                        : null,
                    if ((_pendingParentId ?? _replyTarget?.id) != null)
                      'parentId': _pendingParentId ?? _replyTarget!.id,
                  },
          )
          .then((saved) {
            if (!mounted || actor != _actor || version != _draftVersion) return;
            setState(
              () => _draftStatus = saved
                  ? 'Draft saved on this device.'
                  : 'Draft could not be saved.',
            );
          }),
    );
  }

  @override
  void dispose() {
    _sessionSub?.close();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _composerController.dispose();
    _composerFocusNode.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_isLoadingMore ||
        _isInitialLoading ||
        _nextCursor == null ||
        !_scrollController.hasClients) {
      return;
    }

    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadInitial() async {
    if (!mounted || _isSubmitting) return;
    final epoch = ++_loadEpoch;
    setState(() {
      _isInitialLoading = true;
      _errorMessage = null;
      _isLoadingMore = false;
    });

    try {
      final actor = _actor;
      final page = await _fetchComments();
      final registry = ref.read(contentMutationRegistryProvider);
      await registry.ready;
      final privateComments = <_ThreadComment>[];
      if (actor != 'session' && actor == _actor) {
        final token = await ref.read(jwtProvider.future);
        if (token != null && token.isNotEmpty) {
          for (final item in registry.owned.where(
            (item) => item.kind == 'comment' && item.postId == widget.postId,
          )) {
            if (page.items.any((comment) => comment.id == item.id)) continue;
            try {
              final data = await readOwnerContent(
                dio: ref.read(secureDioProvider),
                kind: 'comment',
                id: item.id,
                actor: actor,
                token: token,
              );
              if (data['postId'] == widget.postId) {
                privateComments.add(_ThreadComment.fromJson(data));
              }
            } on DioException catch (error) {
              if (error.response?.statusCode != 404) rethrow;
            }
          }
        }
      }
      if (!mounted || epoch != _loadEpoch) return;
      _locallySubmitted.removeAll(page.items.map((comment) => comment.id));
      setState(() {
        _comments = _mergeComments(
          _mergeComments(page.items, privateComments),
          _comments
              .where((comment) => _locallySubmitted.contains(comment.id))
              .toList(),
        );
        _nextCursor = page.nextCursor;
        _isInitialLoading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _highlightInitialCommentIfNeeded();
      });
    } on DioException catch (error) {
      if (!mounted || epoch != _loadEpoch) return;
      setState(() {
        _isInitialLoading = false;
        _errorMessage = _messageForCommentsFailure(error);
        _retryAction = _loadInitial;
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch) return;
      setState(() {
        _isInitialLoading = false;
        _errorMessage = 'Unable to load comments right now.';
        _retryAction = _loadInitial;
      });
    }
  }

  Future<void> _loadMore() async {
    final cursor = _nextCursor;
    if (cursor == null || _isLoadingMore || _isInitialLoading || !mounted) {
      return;
    }
    final epoch = _loadEpoch;

    setState(() {
      _isLoadingMore = true;
      _errorMessage = null;
    });

    try {
      final page = await _fetchComments(cursor: cursor);
      if (!mounted || epoch != _loadEpoch) return;
      setState(() {
        _comments = _mergeComments(_comments, page.items);
        _nextCursor = page.nextCursor == cursor ? null : page.nextCursor;
        _isLoadingMore = false;
      });
    } on DioException catch (error) {
      if (!mounted || epoch != _loadEpoch) return;
      setState(() {
        _isLoadingMore = false;
        _errorMessage = _messageForCommentsFailure(error);
        _retryAction = _loadMore;
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch) return;
      setState(() {
        _isLoadingMore = false;
        _errorMessage = 'Unable to load more comments right now.';
        _retryAction = _loadMore;
      });
    }
  }

  Future<_CommentsPage> _fetchComments({String? cursor}) async {
    final dio = ref.read(secureDioProvider);
    final token = await ref.read(jwtProvider.future);
    final response = await dio.get<Map<String, dynamic>>(
      '/api/posts/${widget.postId}/comments',
      queryParameters: {'limit': 25, if (cursor != null) 'cursor': cursor},
      options: Options(
        headers: token != null ? {'Authorization': 'Bearer $token'} : null,
      ),
    );

    final data = contentResponsePayload(response.data);
    final rawItems = data['items'] ?? data['comments'];
    if (rawItems is! List) {
      throw const FormatException('Invalid comments response');
    }
    final items =
        (rawItems as List<dynamic>?)
            ?.whereType<Map<String, dynamic>>()
            .map(_ThreadComment.fromJson)
            .toList() ??
        const <_ThreadComment>[];

    final meta = data['meta'];
    String? nextCursor;
    if (meta is Map<String, dynamic>) {
      nextCursor = meta['nextCursor'] as String?;
    } else if (data['nextCursor'] is String) {
      nextCursor = data['nextCursor'] as String;
    }

    return _CommentsPage(items: items, nextCursor: nextCursor);
  }

  Future<void> _submitComment() async {
    final rawText = _composerController.text.trim();
    if (rawText.isEmpty || _isSubmitting || _confirmingDeletion || _restoring) {
      return;
    }

    final label = _aiLabel;
    final parentId = _pendingParentId ?? _replyTarget?.id;
    final registry = ref.read(contentMutationRegistryProvider);
    final dio = ref.read(secureDioProvider);
    final tokenFuture = ref.read(jwtProvider.future);
    final actor = _actor;
    final sessionEpoch = _sessionEpoch;
    ContentMutationAttempt? attempt;
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final token = await tokenFuture;
      if (!mounted || sessionEpoch != _sessionEpoch) return;
      if (token == null ||
          token.isEmpty ||
          (ref.read(currentUserProvider)?.id ?? 'session') != actor) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Sign in to comment.')));
        return;
      }
      final validation = rawText.length > postTextMaxLength
          ? 'Comment is too long.'
          : validatePublicPostAuthorship(text: rawText, aiLabel: label);
      if (validation != null) {
        throw ContentMutationFailure(validation, uncertain: false);
      }
      final body = {
        'body': rawText,
        'declaredCreationMode': label == 'assisted' ? 'ai_assisted' : 'human',
        if (parentId != null) 'parentId': parentId,
      };
      attempt = await registry.beginDurable(_createScope, body);
      final response = await dio.post<Map<String, dynamic>>(
        '/api/posts/${widget.postId}/comments',
        data: body,
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Idempotency-Key': attempt.key,
          },
        ),
      );

      final payload = contentResponsePayload(response.data);
      if (payload['id'] is! String ||
          (payload['id'] as String).isEmpty ||
          payload['body'] is! String ||
          (payload['body'] as String).isEmpty ||
          payload['declaredCreationMode'] != body['declaredCreationMode'] ||
          payload['parentId'] != parentId ||
          payload['moderationState'] is! String) {
        throw const ContentMutationFailure(
          'The comment outcome is unknown. Retry to check the same submission.',
        );
      }
      final created = _ThreadComment.fromJson({
        'postId': widget.postId,
        'authorId': _actor == 'session' ? '' : _actor,
        'createdAt': DateTime.now().toIso8601String(),
        ...payload,
      });
      await registry.finishDurable(
        attempt,
        receipt: OwnedContent('comment', created.id, postId: widget.postId),
      );
      if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) return;
      ++_draftVersion;
      setState(() {
        _isSubmitting = false;
        _composerController.clear();
        _replyTarget = null;
        _pendingParentId = null;
        _aiLabel = null;
        _locked = false;
        _draftStatus = null;
        _locallySubmitted.add(created.id);
        _comments = _mergeComments(_comments, [created]);
      });
    } catch (error) {
      final failure = contentMutationFailure(error);
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) return;
      setState(() {
        _isSubmitting = false;
        _locked =
            registry.pending(_createScope) != null &&
            registry.pending(_createScope)?.needsReentry != true;
        _errorMessage = failure.message;
        _retryAction = _submitComment;
      });
    }
  }

  List<_ThreadComment> _mergeComments(
    List<_ThreadComment> existing,
    List<_ThreadComment> added,
  ) {
    return {
      for (final comment in existing) comment.id: comment,
      for (final comment in added) comment.id: comment,
    }.values.toList();
  }

  bool _isOwner(_ThreadComment comment) {
    final actor = ref.read(currentUserProvider)?.id;
    return !comment.deleted &&
        actor != null &&
        actor.isNotEmpty &&
        actor == comment.authorId;
  }

  Future<void> _editComment(_ThreadComment comment) async {
    if (_isSubmitting || _confirmingDeletion || !_isOwner(comment)) return;
    final revised = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => ContentEditorScreen(
          contentId: comment.id,
          text: comment.text,
          isComment: true,
          postId: widget.postId,
        ),
      ),
    );
    if (!mounted || revised == null || !_isOwner(comment)) return;
    final updated = _ThreadComment.fromJson({
      'id': comment.id,
      'postId': widget.postId,
      'authorId': comment.authorId,
      'authorUsername': comment.authorUsername,
      'createdAt': comment.createdAt.toIso8601String(),
      'parentId': comment.parentCommentId,
      ...revised,
    });
    setState(() {
      _comments = _mergeComments(_comments, [updated]);
      _locallySubmitted.add(updated.id);
    });
  }

  Future<void> _deleteComment(_ThreadComment comment, {bool ask = true}) async {
    if (_isSubmitting || _confirmingDeletion || !_isOwner(comment)) return;
    final epoch = _sessionEpoch;
    final actor = ref.read(currentUserProvider)!.id;
    final registry = ref.read(contentMutationRegistryProvider);
    final dio = ref.read(secureDioProvider);
    ContentMutationAttempt? attempt;
    setState(() {
      _confirmingDeletion = true;
      _errorMessage = null;
    });
    try {
      if (ask) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Delete comment?'),
            content: const Text(
              'A deleted placeholder may remain to preserve replies.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        );
        if (!mounted) return;
        if (confirmed != true) {
          setState(() => _confirmingDeletion = false);
          return;
        }
      }
      setState(() {
        _confirmingDeletion = false;
        _isSubmitting = true;
      });
      final token = await ref.read(jwtProvider.future);
      if (!mounted) return;
      if (token == null ||
          token.isEmpty ||
          ref.read(currentUserProvider)?.id != actor ||
          epoch != _sessionEpoch) {
        throw const ContentMutationFailure(
          'Sign in as the author to delete this comment.',
          uncertain: false,
        );
      }
      attempt = await registry.beginDurable('comment:$actor:${comment.id}', {
        'method': 'DELETE',
        'postId': widget.postId,
      });
      final response = await dio.delete<Map<String, dynamic>>(
        '/api/comments/${comment.id}',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Idempotency-Key': attempt.key,
          },
        ),
      );
      final payload = contentResponsePayload(response.data);
      if (payload['commentId'] != comment.id || payload['deleted'] != true) {
        throw const ContentMutationFailure(
          'Deletion was not confirmed. Retry to check the same deletion.',
        );
      }
      await registry.finishDurable(
        attempt,
        deleted: true,
        receipt: OwnedContent('comment', comment.id, postId: widget.postId),
      );
      if (!mounted || actor != _actor || epoch != _sessionEpoch) return;
      setState(() {
        _isSubmitting = false;
        _comments = _comments.where((item) => item.id != comment.id).toList();
        _locallySubmitted.remove(comment.id);
        if (_replyTarget?.id == comment.id) _replyTarget = null;
      });
    } catch (error) {
      final failure = contentMutationFailure(error);
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted || actor != _actor || epoch != _sessionEpoch) return;
      setState(() {
        _confirmingDeletion = false;
        _isSubmitting = false;
        _errorMessage = failure.message;
        _retryAction = () => _deleteComment(comment, ask: false);
      });
    }
  }

  Future<void> _handleBack() async {
    if (_isSubmitting) return;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard comment?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (!mounted || discard != true) return;
    final cleared = await ref
        .read(contentMutationRegistryProvider)
        .saveDraft(_createScope, null);
    if (!mounted) return;
    if (!cleared) {
      setState(
        () => _errorMessage =
            'The saved draft could not be cleared. Please retry.',
      );
      return;
    }
    ++_draftVersion;
    _composerController.clear();
    Navigator.of(context).pop();
  }

  Future<void> _retryDeletedComment(ContentMutationAttempt saved) async {
    if (_isSubmitting || _confirmingDeletion) return;
    final epoch = _sessionEpoch;
    final actor = _actor;
    final id = saved.scope.split(':').last;
    final registry = ref.read(contentMutationRegistryProvider);
    ContentMutationAttempt? attempt;
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      final token = await ref.read(jwtProvider.future);
      if (!mounted ||
          actor != _actor ||
          epoch != _sessionEpoch ||
          token == null ||
          token.isEmpty) {
        return;
      }
      attempt = await registry.beginDurable(saved.scope, saved.payload);
      final response = await ref
          .read(secureDioProvider)
          .delete<Map<String, dynamic>>(
            '/api/comments/$id',
            options: Options(
              headers: {
                'Authorization': 'Bearer $token',
                'Idempotency-Key': attempt.key,
              },
            ),
          );
      final data = contentResponsePayload(response.data);
      if (data['commentId'] != id || data['deleted'] != true) {
        throw const ContentMutationFailure(
          'Deletion was not confirmed. Retry the same deletion.',
        );
      }
      await registry.finishDurable(
        attempt,
        deleted: true,
        receipt: OwnedContent('comment', id, postId: widget.postId),
      );
      if (!mounted || actor != _actor || epoch != _sessionEpoch) return;
      setState(() => _isSubmitting = false);
      await _loadInitial();
    } catch (error) {
      final failure = contentMutationFailure(error);
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted || actor != _actor || epoch != _sessionEpoch) return;
      setState(() {
        _isSubmitting = false;
        _errorMessage = failure.message;
        _retryAction = () => _retryDeletedComment(saved);
      });
    } finally {
      if (mounted &&
          actor == _actor &&
          epoch == _sessionEpoch &&
          _isSubmitting) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  String _messageForCommentsFailure(DioException error) {
    final data = error.response?.data;
    String? code;
    String? message;

    if (data is Map<String, dynamic>) {
      code = contentErrorCode(data);
      message =
          (data['message'] ??
                  (data['error'] is Map
                      ? (data['error'] as Map)['message']
                      : null))
              as String?;
    }

    if (code == 'POST_NOT_FOUND' || code == 'post_not_found') {
      return 'This post is unavailable.';
    }
    if (code == ErrorCodes.deviceIntegrityBlocked) {
      return ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked);
    }

    return message ?? 'Unable to load comments right now.';
  }

  void _highlightInitialCommentIfNeeded() {
    final targetId = widget.initialCommentId;
    if (targetId == null || targetId.isEmpty || !_scrollController.hasClients) {
      return;
    }
    final index = _comments.indexWhere((item) => item.id == targetId);
    if (index < 0) {
      return;
    }
    final offset = (index * 88).toDouble();
    final maxOffset = _scrollController.position.maxScrollExtent;
    _scrollController.jumpTo(offset.clamp(0, maxOffset).toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(currentUserProvider) != null;
    final canCompose = signedIn && widget.canSubmit;
    final journal = ref.watch(contentMutationRegistryProvider);
    return PopScope(
      canPop:
          !_isSubmitting &&
          !_confirmingDeletion &&
          (_composerController.text.isEmpty || _locked),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Comments')),
          body: Column(
            children: [
              if (_errorMessage != null)
                MaterialBanner(
                  content: Text(_errorMessage!),
                  actions: [
                    TextButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => _retryAction?.call(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              Expanded(child: _buildCommentList()),
              for (final attempt in journal.attempts.where(
                (attempt) =>
                    attempt.scope.startsWith('comment:$_actor:') &&
                    attempt.payload['method'] == 'DELETE' &&
                    attempt.payload['postId'] == widget.postId &&
                    !_comments.any(
                      (comment) =>
                          !comment.deleted &&
                          attempt.scope.endsWith(':${comment.id}'),
                    ),
              ))
                TextButton(
                  onPressed: _isSubmitting
                      ? null
                      : () => _retryDeletedComment(attempt),
                  child: const Text('Retry saved comment deletion'),
                ),
              if (_restoring) const Text('Restoring draft…'),
              if (!signedIn) const Text('Sign in to comment.'),
              if (signedIn && !widget.canSubmit)
                Text(
                  _sessionEpoch == 0
                      ? 'This post is awaiting publication checks. Comments can be submitted after publication.'
                      : 'Reopen the post to check whether comments are available.',
                ),
              if (_draftStatus != null) Text(_draftStatus!),
              if (_pendingParentId != null && _replyTarget == null)
                const Text('Saved reply target retained.'),
              _ComposerBar(
                key: ValueKey('comment-create-input:$_sessionEpoch'),
                enabled: canCompose,
                controller: _composerController,
                replyTarget: _replyTarget,
                isSubmitting: _isSubmitting || _restoring,
                locked: _locked,
                aiLabel: _aiLabel,
                composerFocusNode: _composerFocusNode,
                onCancelReply: () => setState(() {
                  if (!_isSubmitting && !_locked) {
                    _replyTarget = null;
                    _pendingParentId = null;
                    _saveDraft();
                  }
                }),
                onChanged: _saveDraft,
                onDisclosureChanged: (label) => setState(() {
                  _aiLabel = label;
                  _saveDraft();
                }),
                onSend: _submitComment,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCommentList() {
    if (_isInitialLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_comments.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadInitial,
        child: ListView(
          children: const [
            SizedBox(height: 120),
            Center(child: Text('No comments yet. Be the first to reply.')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadInitial,
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        itemCount: _comments.length + (_isLoadingMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 6),
        itemBuilder: (context, index) {
          if (_isLoadingMore && index == _comments.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }

          final comment = _comments[index];
          final isHighlighted = widget.initialCommentId == comment.id;
          return _CommentTile(
            comment: comment,
            highlighted: isHighlighted,
            onEdit: _isOwner(comment) && !_isSubmitting
                ? () => _editComment(comment)
                : null,
            onDelete: _isOwner(comment) && !_isSubmitting
                ? () => _deleteComment(comment)
                : null,
            onReply:
                comment.deleted ||
                    comment.moderationState == 'under_review' ||
                    !widget.canSubmit ||
                    ref.read(currentUserProvider) == null ||
                    comment.parentCommentId != null ||
                    _isSubmitting ||
                    _locked
                ? null
                : () {
                    setState(() {
                      _replyTarget = comment;
                      _pendingParentId = null;
                    });
                    _saveDraft();
                    _composerFocusNode.requestFocus();
                  },
          );
        },
      ),
    );
  }
}

class _ComposerBar extends StatelessWidget {
  const _ComposerBar({
    super.key,
    required this.controller,
    required this.enabled,
    required this.replyTarget,
    required this.isSubmitting,
    required this.locked,
    required this.aiLabel,
    required this.composerFocusNode,
    required this.onCancelReply,
    required this.onSend,
    required this.onChanged,
    required this.onDisclosureChanged,
  });

  final TextEditingController controller;
  final bool enabled;
  final _ThreadComment? replyTarget;
  final bool isSubmitting;
  final bool locked;
  final String? aiLabel;
  final FocusNode composerFocusNode;
  final VoidCallback onCancelReply;
  final VoidCallback onSend;
  final VoidCallback onChanged;
  final ValueChanged<String> onDisclosureChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (replyTarget != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Replying to @${replyTarget!.authorUsername}',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel reply',
                    onPressed: isSubmitting || locked ? null : onCancelReply,
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            Row(
              key: const ValueKey('comment-composer-input'),
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: composerFocusNode,
                    minLines: 1,
                    maxLines: 4,
                    enabled: enabled && !isSubmitting && !locked,
                    onChanged: (_) => onChanged(),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSend(),
                    decoration: const InputDecoration(
                      labelText: 'Write a reply',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Tooltip(
                  message: locked ? 'Retry same comment' : 'Send reply',
                  child: FilledButton(
                    onPressed: !enabled || isSubmitting ? null : onSend,
                    child: isSubmitting
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : locked
                        ? const Text('Retry same comment')
                        : const Icon(
                            Icons.send,
                            size: 18,
                            semanticLabel: 'Send reply',
                          ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (locked)
              const Text(
                'The previous submission is awaiting confirmation. Retry checks the same submission.',
              ),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Human-authored'),
                  selected: aiLabel == 'human',
                  onSelected: !enabled || isSubmitting || locked
                      ? null
                      : (_) => onDisclosureChanged('human'),
                ),
                ChoiceChip(
                  label: const Text('AI-assisted'),
                  selected: aiLabel == 'assisted',
                  onSelected: !enabled || isSubmitting || locked
                      ? null
                      : (_) => onDisclosureChanged('assisted'),
                ),
              ],
            ),
            const Text(
              'AI-generated public content is not allowed. AI-assisted text is limited to 249 user-perceived characters.',
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.highlighted,
    required this.onReply,
    this.onEdit,
    this.onDelete,
  });

  final _ThreadComment comment;
  final bool highlighted;
  final VoidCallback? onReply;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final leftPadding = comment.parentCommentId == null ? 0.0 : 18.0;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      margin: EdgeInsets.only(left: leftPadding),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlighted
            ? scheme.primaryContainer.withValues(alpha: 0.55)
            : scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '@${comment.authorUsername}',
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _timeAgo(comment.createdAt),
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
          Text(comment.text, style: Theme.of(context).textTheme.bodyMedium),
          if (comment.moderationState == 'under_review')
            const Text('Under review. Publication checks are pending.'),
          if (!comment.deleted && comment.declaredCreationMode != null)
            Text(
              comment.declaredCreationMode == 'ai_assisted'
                  ? 'AI-assisted'
                  : 'Human-authored',
            ),
          Wrap(
            spacing: 8,
            children: [
              if (onReply != null)
                TextButton(
                  onPressed: onReply,
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  child: const Text('Reply'),
                ),
              if (onEdit != null)
                TextButton(
                  onPressed: onEdit,
                  child: const Text('Edit comment'),
                ),
              if (onDelete != null)
                TextButton(
                  onPressed: onDelete,
                  child: const Text('Delete comment'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime value) {
    final diff = DateTime.now().difference(value);
    if (diff.inDays > 0) return '${diff.inDays}d';
    if (diff.inHours > 0) return '${diff.inHours}h';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m';
    return 'now';
  }
}

class _CommentsPage {
  const _CommentsPage({required this.items, required this.nextCursor});

  final List<_ThreadComment> items;
  final String? nextCursor;
}

class _ThreadComment {
  const _ThreadComment({
    required this.id,
    required this.postId,
    required this.authorId,
    required this.authorUsername,
    required this.text,
    required this.createdAt,
    this.parentCommentId,
    this.declaredCreationMode,
    this.moderationState,
    this.deleted = false,
  });

  final String id;
  final String postId;
  final String authorId;
  final String authorUsername;
  final String text;
  final DateTime createdAt;
  final String? parentCommentId;
  final String? declaredCreationMode;
  final String? moderationState;
  final bool deleted;

  factory _ThreadComment.fromJson(Map<String, dynamic> json) {
    final id =
        (json['commentId'] as String?) ?? (json['id'] as String?) ?? 'unknown';
    final authorId = json['authorId'] as String? ?? 'unknown';
    final userFromPayload =
        json['authorUsername'] as String? ??
        json['authorHandle'] as String? ??
        json['username'] as String?;

    String fallbackUsername(String value) {
      if (value.isEmpty) {
        return 'user';
      }
      if (value.length <= 10) {
        return value;
      }
      return value.substring(0, 10);
    }

    final createdAtRaw =
        (json['createdAt'] as String?) ??
        (json['created_at'] as String?) ??
        DateTime.now().toIso8601String();

    return _ThreadComment(
      id: id,
      postId: (json['postId'] as String?) ?? '',
      authorId: authorId,
      authorUsername: userFromPayload ?? fallbackUsername(authorId),
      text: json['deleted'] == true
          ? '[deleted]'
          : (json['body'] ?? json['text']) as String? ?? '',
      createdAt: DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
      parentCommentId: (json['parentId'] ?? json['parentCommentId']) as String?,
      declaredCreationMode: json['declaredCreationMode'] as String?,
      moderationState: json['moderationState'] as String?,
      deleted: json['deleted'] == true,
    );
  }
}

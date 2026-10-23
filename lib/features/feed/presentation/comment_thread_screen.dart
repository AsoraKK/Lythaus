// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lythaus/features/profile/domain/public_author_label.dart';
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
import 'package:lythaus/features/feed/application/comment_preferences.dart';

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
  bool _conversationMode = false;
  bool _nestedReplies = false;
  String _sort = 'newest';
  final _expandedConversations = <String>{};
  final _replyPages = <String, _ReplyPageState>{};
  final _commentKeys = <String, GlobalKey>{};
  String? _contextHighlightId;
  String? _nextCursor;
  bool _isInitialLoading = true;
  bool _isLoadingMore = false;
  bool _isSubmitting = false;
  bool _confirmingDeletion = false;
  String? _errorMessage;
  String? _mutationErrorMessage;
  _ThreadComment? _replyTarget;
  String? _pendingParentId;
  String? _aiLabel;
  bool _locked = false;
  int _loadEpoch = 0;
  int _mutationEpoch = 0;
  int _sessionEpoch = 0;
  bool _deferredInitialReload = false;
  late String _actor;
  String get _createScope => 'comment-create:$_actor:${widget.postId}';
  bool _restoring = false;
  String? _draftStatus;
  int _draftVersion = 0;
  ProviderSubscription<String?>? _sessionSub;
  Future<void> Function()? _retryAction;
  Future<void> Function()? _mutationRetryAction;
  late final String _reloadBlockKey =
      'comment-thread:${identityHashCode(this)}';
  ContentMutationRegistry? _reloadRegistry;

  @override
  void initState() {
    super.initState();
    _reloadRegistry = ref.read(contentMutationRegistryProvider);
    _composerController.addListener(_syncReloadBlock);
    _actor = ref.read(currentUserProvider)?.id ?? 'session';
    _sort = ref.read(commentSortPreferenceProvider(_actor));
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
        ++_mutationEpoch;
        ++_sessionEpoch;
        ++_draftVersion;
        _deferredInitialReload = false;
        _actor = next ?? 'session';
        _sort = ref.read(commentSortPreferenceProvider(_actor));
        _composerController.clear();
        setState(() {
          _comments = const [];
          _expandedConversations.clear();
          _replyPages.clear();
          _nextCursor = null;
          _conversationMode = false;
          _nestedReplies = false;
          _contextHighlightId = null;
          _commentKeys.clear();
          _replyTarget = null;
          _pendingParentId = null;
          _aiLabel = null;
          _locked = false;
          _isSubmitting = false;
          _restoring = false;
          _confirmingDeletion = false;
          _errorMessage = null;
          _mutationErrorMessage = null;
          _draftStatus = null;
        });
        _retryAction = null;
        _mutationRetryAction = null;
        unawaited(_restoreComposer());
        unawaited(_restoreSortAndLoad());
        _syncReloadBlock();
      },
    );
    unawaited(_restoreComposer());
    Future<void>.microtask(_restoreSortAndLoad);
    _syncReloadBlock();
  }

  Future<void> _restoreComposer() async {
    if (_actor == 'session') return;
    _restoring = true;
    _syncReloadBlock();
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
    _syncReloadBlock();
  }

  Future<void> _restoreSort() async {
    final actor = _actor;
    final epoch = _sessionEpoch;
    try {
      final saved = await ref.read(commentSortStoreProvider).read(actor);
      if (!mounted ||
          actor != _actor ||
          epoch != _sessionEpoch ||
          saved == null) {
        return;
      }
      _sort = saved;
      ref.read(commentSortPreferenceProvider(actor).notifier).state = saved;
    } catch (_) {}
  }

  Future<void> _restoreSortAndLoad() async {
    final epoch = _sessionEpoch;
    await _restoreSort();
    if (mounted && epoch == _sessionEpoch) await _loadInitial();
  }

  void _saveDraft() {
    final actor = _actor;
    final version = ++_draftVersion;
    setState(() => _draftStatus = 'Saving draft…');
    _syncReloadBlock();
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
            _syncReloadBlock();
          }),
    );
  }

  void _syncReloadBlock() {
    final hasDraft =
        _composerController.text.isNotEmpty ||
        _replyTarget != null ||
        _pendingParentId != null ||
        _aiLabel != null;
    final safelySaved =
        _composerController.text.isNotEmpty &&
        _actor != 'session' &&
        (_draftStatus == 'Draft saved on this device.' ||
            _draftStatus == 'Draft restored on this device.');
    _reloadRegistry?.setReloadBlocked(
      _reloadBlockKey,
      _isSubmitting ||
          _confirmingDeletion ||
          _restoring ||
          (hasDraft && !safelySaved),
    );
  }

  @override
  void dispose() {
    _composerController.removeListener(_syncReloadBlock);
    _reloadRegistry?.setReloadBlocked(_reloadBlockKey, false);
    _sessionSub?.close();
    _scrollController.removeListener(_onScroll);
    _composerController.dispose();
    _scrollController.dispose();
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
    if (!mounted) return;
    if (_isSubmitting) {
      _deferredInitialReload = true;
      return;
    }
    _deferredInitialReload = false;
    final epoch = ++_loadEpoch;
    final mutationEpoch = _mutationEpoch;
    setState(() {
      _isInitialLoading = true;
      _errorMessage = null;
      _isLoadingMore = false;
    });
    _retryAction = null;

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
              if (data['postId'] == widget.postId &&
                  data['moderationState'] == 'under_review') {
                privateComments.add(_ThreadComment.fromJson(data));
              }
            } on DioException catch (error) {
              if (error.response?.statusCode != 404) rethrow;
            }
          }
        }
      }
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        _requestInitialReload();
        return;
      }
      setState(() {
        _conversationMode = page.conversations;
        _nestedReplies = page.nestedReplies;
        _replyPages.clear();
        _comments = _mergeComments(page.items, privateComments);
        if (!_comments.any((comment) => comment.id == _replyTarget?.id)) {
          _pendingParentId ??= _replyTarget?.id;
          _replyTarget = null;
        }
        _nextCursor = page.nextCursor;
        _isInitialLoading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _highlightInitialCommentIfNeeded();
      });
      for (final root in page.items.where(
        (comment) =>
            comment.parentCommentId == null &&
            _expandedConversations.contains(comment.id),
      )) {
        unawaited(_loadReplies(root.id));
      }
    } on DioException catch (error) {
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        _requestInitialReload();
        return;
      }
      setState(() {
        _isInitialLoading = false;
        _clearUnavailableComments(error);
        _errorMessage = _messageForCommentsFailure(error);
        _retryAction = _loadInitial;
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        _requestInitialReload();
        return;
      }
      setState(() {
        _isInitialLoading = false;
        _errorMessage = 'Unable to load comments right now.';
        _retryAction = _loadInitial;
      });
    }
  }

  void _requestInitialReload() {
    if (!mounted) return;
    _deferredInitialReload = true;
    _drainDeferredInitialReload();
  }

  void _drainDeferredInitialReload() {
    if (!mounted || !_deferredInitialReload || _isSubmitting) return;
    _deferredInitialReload = false;
    unawaited(_loadInitial());
  }

  Future<void> _loadMore() async {
    final cursor = _nextCursor;
    if (cursor == null || _isLoadingMore || _isInitialLoading || !mounted) {
      return;
    }
    final epoch = _loadEpoch;
    final mutationEpoch = _mutationEpoch;

    setState(() {
      _isLoadingMore = true;
      _errorMessage = null;
    });
    _retryAction = null;

    try {
      final page = await _fetchComments(cursor: cursor);
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        setState(() => _isLoadingMore = false);
        return;
      }
      setState(() {
        _comments = _mergeComments(_comments, page.items);
        _nextCursor = page.nextCursor == cursor ? null : page.nextCursor;
        _isLoadingMore = false;
      });
    } on DioException catch (error) {
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        setState(() => _isLoadingMore = false);
        return;
      }
      setState(() {
        _isLoadingMore = false;
        _clearUnavailableComments(error);
        _errorMessage = _messageForCommentsFailure(error);
        _retryAction = _loadMore;
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch) return;
      if (mutationEpoch != _mutationEpoch) {
        setState(() => _isLoadingMore = false);
        return;
      }
      setState(() {
        _isLoadingMore = false;
        _errorMessage = 'Unable to load more comments right now.';
        _retryAction = _loadMore;
      });
    }
  }

  Future<_CommentsPage> _fetchComments({
    String? cursor,
    String? conversationId,
    String? targetId,
    bool refresh = false,
  }) async {
    final dio = ref.read(secureDioProvider);
    final token = await ref.read(jwtProvider.future);
    final response = await dio.get<Map<String, dynamic>>(
      '/api/posts/${widget.postId}/comments',
      queryParameters: {
        'limit': 25,
        'view': 'conversations',
        'sort': _sort,
        if (cursor != null) 'cursor': cursor,
        if (conversationId != null) 'conversationId': conversationId,
        if (targetId != null) 'targetId': targetId,
        if (refresh) 'refresh': 'true',
      },
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

    final capabilities = data['capabilities'];
    return _CommentsPage(
      items: items,
      nextCursor: nextCursor,
      refreshCursor: data['refreshCursor'] as String?,
      conversations:
          capabilities is Map && capabilities['conversations'] == true,
      nestedReplies:
          capabilities is Map && capabilities['nestedReplies'] == true,
    );
  }

  Future<void> _loadReplies(
    String conversationId, {
    bool checkNew = false,
  }) async {
    final previous = _replyPages[conversationId] ?? _ReplyPageState();
    if (previous.loading) return;
    final epoch = _loadEpoch;
    final mutationEpoch = _mutationEpoch;
    final cursor = checkNew ? previous.refreshCursor : previous.nextCursor;
    setState(() {
      _expandedConversations.add(conversationId);
      _replyPages[conversationId] = previous..loading = true;
      previous.error = null;
    });
    try {
      final page = await _fetchComments(
        cursor: cursor,
        conversationId: conversationId,
        refresh: checkNew,
      );
      if (!mounted || epoch != _loadEpoch || mutationEpoch != _mutationEpoch) {
        return;
      }
      setState(() {
        previous.items = _mergeComments(
          previous.items,
          page.items,
          chronological: true,
        );
        _comments = _mergeComments(_comments, page.items);
        previous.nextCursor = page.nextCursor;
        previous.refreshCursor = page.refreshCursor ?? previous.refreshCursor;
        previous.loaded = true;
        previous.loading = false;
      });
    } on DioException catch (error) {
      if (!mounted || epoch != _loadEpoch || mutationEpoch != _mutationEpoch) {
        return;
      }
      setState(() {
        previous.loading = false;
        previous.error = 'Unable to load replies. Please try again.';
        _clearUnavailableComments(error);
        if ([401, 403, 404].contains(error.response?.statusCode)) {
          _errorMessage = 'This conversation is unavailable.';
          _retryAction = _loadInitial;
        }
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch || mutationEpoch != _mutationEpoch) {
        return;
      }
      setState(() {
        previous.loading = false;
        previous.error = 'Unable to load replies. Please try again.';
      });
    } finally {
      if (mounted && epoch == _loadEpoch && previous.loading) {
        setState(() => previous.loading = false);
      }
    }
  }

  void _changeSort(String sort) {
    if (_sort == sort || _isSubmitting) return;
    setState(() {
      _sort = sort;
      _nextCursor = null;
      _replyPages.clear();
    });
    ref.read(commentSortPreferenceProvider(_actor).notifier).state = sort;
    unawaited(
      ref
          .read(commentSortStoreProvider)
          .write(_actor, sort)
          .catchError((Object _) {}),
    );
    if (_scrollController.hasClients) _scrollController.jumpTo(0);
    unawaited(_loadInitial());
  }

  Future<void> _revealComment(String targetId) async {
    final epoch = _loadEpoch;
    var revealAtEnd = false;
    try {
      if (_commentKeys[targetId]?.currentContext == null) {
        final targetPage = await _fetchComments(targetId: targetId);
        if (!mounted || epoch != _loadEpoch) return;
        final target = targetPage.items
            .where((item) => item.id == targetId)
            .firstOrNull;
        if (target == null) {
          throw const FormatException('Unavailable reply target');
        }
        final rootId = target.conversationId ?? target.id;
        final rootPage = _comments.any((item) => item.id == rootId)
            ? null
            : await _fetchComments(targetId: rootId);
        if (!mounted || epoch != _loadEpoch) return;
        revealAtEnd = rootPage != null;
        setState(() {
          _comments = _mergeComments(_comments, [...?rootPage?.items, target]);
          _expandedConversations.add(rootId);
        });
      }
      if (!mounted || epoch != _loadEpoch) return;
      setState(() => _contextHighlightId = targetId);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || epoch != _loadEpoch) return;
        void reveal() {
          if (!mounted || epoch != _loadEpoch) return;
          final targetContext = _commentKeys[targetId]?.currentContext;
          if (targetContext != null) {
            unawaited(
              Scrollable.ensureVisible(
                targetContext,
                duration: const Duration(milliseconds: 200),
                alignment: 0.15,
              ),
            );
          }
        }

        if (revealAtEnd && _scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
          WidgetsBinding.instance.addPostFrameCallback((_) => reveal());
        } else {
          reveal();
        }
      });
    } catch (_) {
      if (!mounted || epoch != _loadEpoch) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This reply target is unavailable.')),
      );
    }
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
      _mutationErrorMessage = null;
    });
    _syncReloadBlock();
    _retryAction = null;
    _mutationRetryAction = null;

    try {
      final token = await tokenFuture;
      if (!mounted || sessionEpoch != _sessionEpoch) return;
      if (token == null ||
          token.isEmpty ||
          (ref.read(currentUserProvider)?.id ?? 'session') != actor) {
        setState(() => _isSubmitting = false);
        _syncReloadBlock();
        _drainDeferredInitialReload();
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
          payload['moderationState'] != 'under_review' ||
          (payload['postId'] != null && payload['postId'] != widget.postId) ||
          (payload['authorId'] != null && payload['authorId'] != actor)) {
        throw const ContentMutationFailure(
          'The comment outcome is unknown. Retry to check the same submission.',
        );
      }
      final created = _ThreadComment.fromJson({
        'postId': widget.postId,
        'conversationId': _replyTarget?.conversationId ?? _replyTarget?.id,
        'authorId': _actor == 'session' ? '' : _actor,
        'createdAt': DateTime.now().toIso8601String(),
        ...payload,
      });
      await registry.finishDurable(
        attempt,
        receipt: OwnedContent('comment', created.id, postId: widget.postId),
      );
      if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) return;
      ++_mutationEpoch;
      ++_draftVersion;
      setState(() {
        _isSubmitting = false;
        _composerController.clear();
        _replyTarget = null;
        _pendingParentId = null;
        _aiLabel = null;
        _locked = false;
        _draftStatus = null;
        _comments = _mergeComments(_comments, [created]);
        if (created.parentCommentId != null && created.conversationId != null) {
          _expandedConversations.add(created.conversationId!);
        }
      });
      _syncReloadBlock();
      _drainDeferredInitialReload();
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
        _mutationErrorMessage = failure.message;
      });
      _syncReloadBlock();
      _mutationRetryAction = _submitComment;
      _drainDeferredInitialReload();
    }
  }

  List<_ThreadComment> _mergeComments(
    List<_ThreadComment> existing,
    List<_ThreadComment> added, {
    bool chronological = false,
  }) {
    final merged = {
      for (final comment in existing) comment.id: comment,
      for (final comment in added) comment.id: comment,
    }.values.toList();
    merged.sort((left, right) {
      final timestamp = left.createdAt.compareTo(right.createdAt);
      final comparison = timestamp != 0
          ? timestamp
          : left.id.compareTo(right.id);
      return _conversationMode && _sort == 'newest' && !chronological
          ? -comparison
          : comparison;
    });
    return merged;
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
    final currentIndex = _comments.indexWhere((item) => item.id == comment.id);
    if (currentIndex < 0 || _comments[currentIndex].deleted) return;
    final current = _comments[currentIndex];
    if (!_isOwner(current)) return;
    final updated = _ThreadComment.fromJson({
      'id': current.id,
      'postId': widget.postId,
      'authorId': current.authorId,
      'authorUsername': current.authorUsername,
      'createdAt': current.createdAt.toIso8601String(),
      'parentId': current.parentCommentId,
      'conversationId': current.conversationId,
      'replyCount': current.replyCount,
      'replyToAuthorId': current.replyToAuthorId,
      'replyToDeleted': current.replyToDeleted,
      ...revised,
    });
    ++_mutationEpoch;
    setState(() {
      _comments = _mergeComments(_comments, [updated]);
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
      _mutationErrorMessage = null;
    });
    _syncReloadBlock();
    _retryAction = null;
    _mutationRetryAction = null;
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
          _syncReloadBlock();
          return;
        }
      }
      setState(() {
        _confirmingDeletion = false;
        _isSubmitting = true;
      });
      _syncReloadBlock();
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
      ++_mutationEpoch;
      setState(() {
        _isSubmitting = false;
        final tombstone = _ThreadComment.fromJson({
          'id': comment.id,
          'authorId': comment.authorId,
          'authorUsername': comment.authorUsername,
          'createdAt': comment.createdAt.toIso8601String(),
          'parentId': comment.parentCommentId,
          'conversationId': comment.conversationId,
          'replyCount': comment.replyCount,
          'moderationState': comment.moderationState,
          'deleted': true,
        });
        _comments = comment.moderationState == 'allowed'
            ? _mergeComments(_comments, [tombstone])
            : _comments.where((item) => item.id != comment.id).toList();
        for (final page in _replyPages.values) {
          page.items.removeWhere((item) => item.id == comment.id);
        }
        if (_replyTarget?.id == comment.id) _replyTarget = null;
      });
      _syncReloadBlock();
      _drainDeferredInitialReload();
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
        _mutationErrorMessage = failure.message;
      });
      _syncReloadBlock();
      _mutationRetryAction = () => _deleteComment(comment, ask: false);
      _drainDeferredInitialReload();
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
      _mutationErrorMessage = null;
    });
    _syncReloadBlock();
    _retryAction = null;
    _mutationRetryAction = null;
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
      ++_mutationEpoch;
      setState(() => _isSubmitting = false);
      _syncReloadBlock();
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
        _mutationErrorMessage = failure.message;
      });
      _syncReloadBlock();
      _mutationRetryAction = () => _retryDeletedComment(saved);
      _drainDeferredInitialReload();
    } finally {
      if (mounted &&
          actor == _actor &&
          epoch == _sessionEpoch &&
          _isSubmitting) {
        setState(() => _isSubmitting = false);
        _syncReloadBlock();
        _drainDeferredInitialReload();
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

  void _clearUnavailableComments(DioException error) {
    if (![401, 403, 404].contains(error.response?.statusCode)) return;
    _comments = const [];
    _replyPages.clear();
    _expandedConversations.clear();
    _nextCursor = null;
    _pendingParentId ??= _replyTarget?.id;
    _replyTarget = null;
  }

  void _highlightInitialCommentIfNeeded() {
    final targetId = widget.initialCommentId;
    if (_conversationMode &&
        targetId != null &&
        _contextHighlightId != targetId) {
      unawaited(_revealComment(targetId));
      return;
    }
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
          body: LayoutBuilder(
            builder: (context, constraints) => Column(
              children: [
                if (_mutationErrorMessage != null)
                  MaterialBanner(
                    content: Text(_mutationErrorMessage!),
                    actions: [
                      TextButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => _mutationRetryAction?.call(),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
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
                if (_conversationMode)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ChoiceChip(
                          label: const Text('Newest'),
                          selected: _sort == 'newest',
                          onSelected: _isSubmitting
                              ? null
                              : (_) => _changeSort('newest'),
                        ),
                        ChoiceChip(
                          label: const Text('Oldest'),
                          selected: _sort == 'oldest',
                          onSelected: _isSubmitting
                              ? null
                              : (_) => _changeSort('oldest'),
                        ),
                        const Tooltip(
                          message:
                              'Relevance sorting is not available yet. Choose Newest or Oldest.',
                          child: ChoiceChip(
                            label: Text('Most relevant'),
                            selected: false,
                          ),
                        ),
                        const Text('Most relevant is not available yet.'),
                      ],
                    ),
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
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: constraints.maxHeight * 0.5,
                  ),
                  child: SingleChildScrollView(
                    child: _ComposerBar(
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
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCommentList() {
    final roots = _comments
        .where((comment) => comment.parentCommentId == null)
        .map((comment) => comment.id)
        .toSet();
    final comments = _conversationMode
        ? _comments
              .where(
                (comment) =>
                    comment.parentCommentId == null ||
                    !roots.contains(comment.conversationId),
              )
              .toList()
        : _comments;
    if (_isInitialLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (comments.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadInitial,
        child: ListView(
          children: [
            const SizedBox(height: 120),
            Center(
              child: Text(
                _errorMessage != null
                    ? 'Comments are unavailable.'
                    : 'No comments yet. Be the first to reply.',
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadInitial,
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        itemCount: comments.length + (_isLoadingMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 6),
        itemBuilder: (context, index) {
          if (_isLoadingMore && index == comments.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }

          final comment = comments[index];
          final isHighlighted = widget.initialCommentId == comment.id;
          return _conversationMode && comment.parentCommentId == null
              ? _buildConversation(comment)
              : _buildCommentTile(comment, isHighlighted);
        },
      ),
    );
  }

  Widget _buildConversation(_ThreadComment root) {
    if (root.moderationState != 'allowed') {
      return _buildCommentTile(root, widget.initialCommentId == root.id);
    }
    final expanded = _expandedConversations.contains(root.id);
    final page = _replyPages[root.id];
    final privateReplies = _comments
        .where(
          (comment) =>
              comment.parentCommentId != null &&
              comment.conversationId == root.id,
        )
        .toList();
    final replies = _mergeComments(
      page?.items ?? [],
      privateReplies,
      chronological: true,
    ).where(_hasVisibleLoadedAncestors).toList();
    return Column(
      key: ValueKey('conversation:${root.id}'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildCommentTile(root, widget.initialCommentId == root.id),
        if (root.replyCount > 0 || replies.isNotEmpty || expanded)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Semantics(
              expanded: expanded,
              child: TextButton.icon(
                key: ValueKey('expand:${root.id}'),
                icon: Icon(expanded ? Icons.expand_less : Icons.expand_more),
                label: Text(
                  expanded
                      ? 'Hide replies'
                      : root.replyCount > 0
                      ? 'View ${root.replyCount} replies'
                      : 'View replies',
                ),
                onPressed: () {
                  if (expanded) {
                    setState(() => _expandedConversations.remove(root.id));
                  } else if (page?.loaded == true) {
                    setState(() => _expandedConversations.add(root.id));
                  } else {
                    unawaited(_loadReplies(root.id));
                  }
                },
              ),
            ),
          ),
        if (expanded) ...[
          for (final reply in replies)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: _buildCommentTile(
                reply,
                widget.initialCommentId == reply.id,
              ),
            ),
          if (page?.error != null)
            Text(page!.error!, semanticsLabel: page.error),
          if (page?.loading == true)
            const Center(child: CircularProgressIndicator())
          else
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => _loadReplies(
                  root.id,
                  checkNew: page?.loaded == true && page?.nextCursor == null,
                ),
                child: Text(
                  page?.error != null
                      ? 'Retry replies'
                      : page?.nextCursor != null
                      ? 'Load more replies'
                      : 'Check for new replies',
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _buildCommentTile(_ThreadComment comment, bool isHighlighted) {
    final replyTarget = [
      ..._comments,
      for (final page in _replyPages.values) ...page.items,
    ].where((candidate) => candidate.id == comment.parentCommentId).firstOrNull;
    return _CommentTile(
      key: _commentKeys.putIfAbsent(comment.id, GlobalKey.new),
      comment: comment,
      replyContext: comment.parentCommentId == null
          ? null
          : comment.replyToDeleted || replyTarget?.deleted == true
          ? 'Replying to a deleted comment'
          : replyTarget != null
          ? 'Replying to ${replyTarget.authorUsername}'
          : comment.replyToAuthorId != null
          ? 'Replying to ${publicAuthorLabel(null, authorId: comment.replyToAuthorId!)}'
          : 'Replying to an earlier comment',
      highlighted: isHighlighted || _contextHighlightId == comment.id,
      onReplyContext: comment.parentCommentId == null
          ? null
          : () => _revealComment(comment.parentCommentId!),
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
              (comment.parentCommentId != null && !_nestedReplies) ||
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
  }

  bool _hasVisibleLoadedAncestors(_ThreadComment comment) {
    final byId = {for (final item in _comments) item.id: item};
    final seen = <String>{comment.id};
    var parentId = comment.parentCommentId;
    while (parentId != null) {
      if (!seen.add(parentId)) return false;
      final parent = byId[parentId];
      if (parent == null) return true;
      if (parent.moderationState != 'allowed') return false;
      parentId = parent.parentCommentId;
    }
    return true;
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
                      'Replying to ${replyTarget!.authorUsername}',
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
    super.key,
    required this.comment,
    required this.highlighted,
    required this.onReply,
    this.onEdit,
    this.onDelete,
    this.replyContext,
    this.onReplyContext,
  });

  final _ThreadComment comment;
  final bool highlighted;
  final VoidCallback? onReply;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final String? replyContext;
  final VoidCallback? onReplyContext;

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
                  comment.authorUsername,
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
          if (replyContext != null)
            Semantics(
              button: true,
              label: replyContext,
              onTap: onReplyContext,
              child: ExcludeSemantics(
                child: TextButton(
                  onPressed: onReplyContext,
                  child: Text(replyContext!),
                ),
              ),
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
  const _CommentsPage({
    required this.items,
    required this.nextCursor,
    this.refreshCursor,
    this.conversations = false,
    this.nestedReplies = false,
  });

  final List<_ThreadComment> items;
  final String? nextCursor;
  final String? refreshCursor;
  final bool conversations;
  final bool nestedReplies;
}

class _ReplyPageState {
  List<_ThreadComment> items = [];
  String? nextCursor;
  String? refreshCursor;
  bool loaded = false;
  bool loading = false;
  String? error;
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
    this.conversationId,
    this.replyCount = 0,
    this.replyToAuthorId,
    this.replyToDeleted = false,
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
  final String? conversationId;
  final int replyCount;
  final String? replyToAuthorId;
  final bool replyToDeleted;

  factory _ThreadComment.fromJson(Map<String, dynamic> json) {
    final id =
        (json['commentId'] as String?) ?? (json['id'] as String?) ?? 'unknown';
    final authorId = json['authorId'] as String? ?? 'unknown';
    final userFromPayload =
        json['authorDisplayName'] as String? ??
        json['authorUsername'] as String? ??
        json['username'] as String?;

    final createdAtRaw =
        (json['createdAt'] as String?) ??
        (json['created_at'] as String?) ??
        DateTime.now().toIso8601String();

    return _ThreadComment(
      id: id,
      postId: (json['postId'] as String?) ?? '',
      authorId: authorId,
      authorUsername: publicAuthorLabel(
        userFromPayload,
        handle: json['authorHandle'] as String?,
        authorId: authorId,
      ),
      text: json['deleted'] == true
          ? '[deleted]'
          : (json['body'] ?? json['text']) as String? ?? '',
      createdAt: DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
      parentCommentId: (json['parentId'] ?? json['parentCommentId']) as String?,
      declaredCreationMode: json['declaredCreationMode'] as String?,
      moderationState: json['moderationState'] as String?,
      deleted: json['deleted'] == true,
      conversationId: json['conversationId'] as String?,
      replyCount: json['replyCount'] as int? ?? 0,
      replyToAuthorId: json['replyToAuthorId'] as String?,
      replyToDeleted: json['replyToDeleted'] == true,
    );
  }
}

// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

class CommentThreadScreen extends ConsumerStatefulWidget {
  const CommentThreadScreen({
    super.key,
    required this.postId,
    this.initialCommentId,
  });

  final String postId;
  final String? initialCommentId;

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
  String? _errorMessage;
  _ThreadComment? _replyTarget;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    Future<void>.microtask(_loadInitial);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _composerController.dispose();
    _composerFocusNode.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_isLoadingMore ||
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
    setState(() {
      _isInitialLoading = true;
      _errorMessage = null;
    });

    try {
      final page = await _fetchComments();
      setState(() {
        _comments = page.items;
        _nextCursor = page.nextCursor;
        _isInitialLoading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _highlightInitialCommentIfNeeded();
      });
    } on DioException catch (error) {
      setState(() {
        _isInitialLoading = false;
        _errorMessage = _messageForCommentsFailure(error);
      });
    } catch (_) {
      setState(() {
        _isInitialLoading = false;
        _errorMessage = 'Unable to load comments right now.';
      });
    }
  }

  Future<void> _loadMore() async {
    final cursor = _nextCursor;
    if (cursor == null || _isLoadingMore) {
      return;
    }

    setState(() {
      _isLoadingMore = true;
      _errorMessage = null;
    });

    try {
      final page = await _fetchComments(cursor: cursor);
      setState(() {
        _comments = [..._comments, ...page.items];
        _nextCursor = page.nextCursor;
        _isLoadingMore = false;
      });
    } on DioException catch (error) {
      setState(() {
        _isLoadingMore = false;
        _errorMessage = _messageForCommentsFailure(error);
      });
    } catch (_) {
      setState(() {
        _isLoadingMore = false;
        _errorMessage = 'Unable to load more comments right now.';
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

    final data = response.data ?? const <String, dynamic>{};
    final rawItems = data['items'] ?? data['comments'];
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
    if (rawText.isEmpty || _isSubmitting) {
      return;
    }

    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Sign in to comment.')));
      return;
    }

    final finalText = _withReplyPrefix(rawText, _replyTarget);

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final dio = ref.read(secureDioProvider);
      final response = await dio.post<Map<String, dynamic>>(
        '/api/posts/${widget.postId}/comments',
        data: {'text': finalText},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      final payload = response.data ?? const <String, dynamic>{};
      final rawComment = payload['comment'];
      final created = rawComment is Map<String, dynamic>
          ? _ThreadComment.fromJson(rawComment)
          : null;

      setState(() {
        _isSubmitting = false;
        _composerController.clear();
        _replyTarget = null;
        if (created != null) {
          _comments = [created, ..._comments];
        }
      });
    } on DioException catch (error) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = _messageForCreateFailure(error);
      });
    } catch (_) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = 'Unable to post comment right now.';
      });
    }
  }

  String _withReplyPrefix(String text, _ThreadComment? replyTarget) {
    if (replyTarget == null) {
      return text;
    }
    final mention = '@${replyTarget.authorUsername}';
    if (text.startsWith(mention)) {
      return text;
    }
    return '$mention $text';
  }

  String _messageForCommentsFailure(DioException error) {
    final data = error.response?.data;
    String? code;
    String? message;

    if (data is Map<String, dynamic>) {
      code = (data['code'] ?? (data['error'] as Map?)?['code']) as String?;
      message =
          (data['message'] ?? (data['error'] as Map?)?['message']) as String?;
    }

    if (code == 'POST_NOT_FOUND') {
      return 'This post is unavailable.';
    }
    if (code == ErrorCodes.deviceIntegrityBlocked) {
      return ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked);
    }

    return message ?? 'Unable to load comments right now.';
  }

  String _messageForCreateFailure(DioException error) {
    final data = error.response?.data;
    String? code;
    String? message;

    if (data is Map<String, dynamic>) {
      code = (data['code'] ?? (data['error'] as Map?)?['code']) as String?;
      message =
          (data['message'] ?? (data['error'] as Map?)?['message']) as String?;
    }

    if (code == ErrorCodes.deviceIntegrityBlocked) {
      return ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked);
    }
    if (code == 'CONTENT_BLOCKED' || code == 'content_blocked') {
      return 'This comment appears to conflict with policy and was not posted.';
    }
    if (code == 'DAILY_COMMENT_LIMIT_EXCEEDED' ||
        code == 'daily_comment_limit_exceeded') {
      return 'You have reached your daily comment limit. Please try again tomorrow.';
    }
    if (error.response?.statusCode == 429) {
      return 'Too many comments. Please wait before trying again.';
    }
    if (error.response?.statusCode == 401 ||
        error.response?.statusCode == 403) {
      return 'Sign in to comment.';
    }

    return message ?? 'Unable to post comment.';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Comments')),
      body: Column(
        children: [
          if (_errorMessage != null)
            MaterialBanner(
              content: Text(_errorMessage!),
              actions: [
                TextButton(onPressed: _loadInitial, child: const Text('Retry')),
              ],
            ),
          Expanded(child: _buildCommentList()),
          _ComposerBar(
            controller: _composerController,
            replyTarget: _replyTarget,
            isSubmitting: _isSubmitting,
            composerFocusNode: _composerFocusNode,
            onCancelReply: () => setState(() {
              _replyTarget = null;
            }),
            onSend: _submitComment,
          ),
        ],
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
            onReply: () {
              setState(() {
                _replyTarget = comment;
              });
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
    required this.controller,
    required this.replyTarget,
    required this.isSubmitting,
    required this.composerFocusNode,
    required this.onCancelReply,
    required this.onSend,
  });

  final TextEditingController controller;
  final _ThreadComment? replyTarget;
  final bool isSubmitting;
  final FocusNode composerFocusNode;
  final VoidCallback onCancelReply;
  final VoidCallback onSend;

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
                    onPressed: onCancelReply,
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: composerFocusNode,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSend(),
                    decoration: const InputDecoration(
                      hintText: 'Write a reply',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: isSubmitting ? null : onSend,
                  child: isSubmitting
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send, size: 18),
                ),
              ],
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
  });

  final _ThreadComment comment;
  final bool highlighted;
  final VoidCallback onReply;

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
              Text(
                '@${comment.authorUsername}',
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              Text(
                _timeAgo(comment.createdAt),
                style: Theme.of(context).textTheme.labelSmall,
              ),
              const Spacer(),
              TextButton(
                onPressed: onReply,
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
                child: const Text('Reply'),
              ),
            ],
          ),
          Text(comment.text, style: Theme.of(context).textTheme.bodyMedium),
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
  });

  final String id;
  final String postId;
  final String authorId;
  final String authorUsername;
  final String text;
  final DateTime createdAt;
  final String? parentCommentId;

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
      text: (json['text'] as String?) ?? '',
      createdAt: DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
      parentCommentId: json['parentCommentId'] as String?,
    );
  }
}

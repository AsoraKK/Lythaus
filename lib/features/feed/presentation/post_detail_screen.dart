// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/reactions/presentation/reaction_bar.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';
import 'package:lythaus/ui/components/trust_strip_row.dart';
import 'package:lythaus/ui/components/authorship_disclosure.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/feed/application/owner_content_repository.dart';
import 'package:lythaus/state/providers/feed_providers.dart' as live;

class PostDetailScreen extends ConsumerStatefulWidget {
  const PostDetailScreen({
    super.key,
    required this.postId,
    this.initialCommentId,
  });

  final String postId;
  final String? initialCommentId;

  @override
  ConsumerState<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends ConsumerState<PostDetailScreen> {
  late Future<domain.Post> _future;
  bool _busy = false;
  String? _mutationError;
  String? _actor;
  int _readEpoch = 0;
  ProviderSubscription<String?>? _sessionSub;

  bool _isOwner(domain.Post post) {
    final actor = ref.read(currentUserProvider)?.id;
    return actor != null && actor.isNotEmpty && actor == post.authorId;
  }

  void _refreshFeeds() {
    ref.invalidate(live.liveFeedStateProvider);
    ref.invalidate(live.liveFeedItemsProvider);
  }

  Future<void> _editPost(domain.Post post) async {
    if (_busy || !_isOwner(post)) return;
    final epoch = _readEpoch;
    final revised = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            ContentEditorScreen(contentId: post.id, text: post.text),
      ),
    );
    if (!mounted || revised == null || !_isOwner(post) || epoch != _readEpoch) {
      return;
    }
    final merged = domain.Post.fromJson({
      ...post.toJson(),
      ...revised,
      'authorship': revised['moderationState'] == 'under_review'
          ? const domain.PostAuthorship.underReview().toJson()
          : post.authorship.toJson(),
      if (revised['moderationState'] == 'under_review') ...{
        'trustStatus': 'no_extra_signals',
        'timeline': const domain.PostTrustTimeline().toJson(),
        'proofSignalsProvided': false,
        'verifiedContextBadgeEligible': false,
        'featuredEligible': false,
      },
    });
    setState(() {
      _future = Future.value(merged);
      _mutationError = null;
    });
    _refreshFeeds();
  }

  Future<void> _deletePost(domain.Post? post, {String? savedId}) async {
    final epoch = _readEpoch;
    final actor = ref.read(currentUserProvider)?.id;
    if (_busy || actor == null || (post != null && !_isOwner(post))) return;
    final id = post?.id ?? savedId;
    if (id == null) return;
    final registry = ref.read(contentMutationRegistryProvider);
    if (post == null &&
        registry.pending('post:$actor:$id')?.payload['method'] != 'DELETE') {
      return;
    }
    final repository = ref.read(postRepositoryProvider);
    ContentMutationAttempt? attempt;
    setState(() {
      _busy = true;
      _mutationError = null;
    });
    try {
      final confirmed = post == null
          ? true
          : await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Delete post?'),
                content: const Text('This removes the post from your feeds.'),
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
        setState(() => _busy = false);
        return;
      }
      final token = await ref.read(jwtProvider.future);
      if (!mounted) return;
      if (token == null ||
          epoch != _readEpoch ||
          token.isEmpty ||
          (post != null && !_isOwner(post)) ||
          ref.read(currentUserProvider)?.id != actor) {
        throw const ContentMutationFailure(
          'Sign in as the author to delete this post.',
          uncertain: false,
        );
      }
      attempt = await registry.beginDurable('post:$actor:$id', {
        'method': 'DELETE',
      });
      final deleted = await repository.deletePost(
        postId: id,
        token: token,
        idempotencyKey: attempt.key,
      );
      if (!deleted) {
        throw const ContentMutationFailure(
          'Deletion was not confirmed. Retry to check the same deletion.',
        );
      }
      await registry.finishDurable(
        attempt,
        deleted: true,
        receipt: OwnedContent('post', id),
      );
      if (!mounted || actor != _actor || epoch != _readEpoch) return;
      _refreshFeeds();
      Navigator.of(context).pop(true);
    } catch (error) {
      final failure = contentMutationFailure(
        error is PostException
            ? error.originalError as Object? ?? error
            : error,
      );
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted || actor != _actor || epoch != _readEpoch) return;
      setState(() {
        _busy = false;
        _mutationError = failure.message;
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _actor = ref.read(currentUserProvider)?.id;
    _future = _loadPost();
    _sessionSub = ref.listenManual(
      currentUserProvider.select((user) => user?.id),
      (previous, next) {
        if (next == _actor) return;
        _actor = next;
        ++_readEpoch;
        setState(() {
          _busy = false;
          _mutationError = null;
          _future = _loadPost();
        });
      },
    );
  }

  Future<domain.Post> _loadPost() async {
    final actor = _actor;
    final epoch = _readEpoch;
    final repository = ref.read(postRepositoryProvider);
    final token = await ref.read(jwtProvider.future);
    domain.Post post;
    try {
      post = await repository.getPost(postId: widget.postId, token: token);
    } on PostException catch (error) {
      if (error.code != 'not_found' ||
          actor == null ||
          token == null ||
          token.isEmpty ||
          actor != _actor ||
          epoch != _readEpoch) {
        rethrow;
      }
      final data = await readOwnerContent(
        dio: ref.read(secureDioProvider),
        kind: 'post',
        id: widget.postId,
        actor: actor,
        token: token,
      );
      post = domain.Post.fromJson({
        ...data,
        'authorship': const domain.PostAuthorship.underReview().toJson(),
      });
    }
    if (epoch != _readEpoch || actor != _actor) {
      throw const ContentMutationFailure(
        'Your session changed. Reopen the post.',
        uncertain: false,
      );
    }
    return post;
  }

  @override
  void dispose() {
    _sessionSub?.close();
    super.dispose();
  }

  Future<void> _openComments(BuildContext context, domain.Post post) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CommentThreadScreen(
          postId: post.id,
          canSubmit: post.moderationState != 'under_review',
          initialCommentId: widget.initialCommentId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(currentUserProvider);
    final journal = ref.watch(contentMutationRegistryProvider);
    final pendingDelete = _actor == null
        ? null
        : journal.pending('post:$_actor:${widget.postId}');
    return PopScope(
      canPop: !_busy,
      child: ReadingPane(
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Post'),
            actions: [
              FutureBuilder<domain.Post>(
                key: ValueKey(_actor),
                future: _future,
                builder: (context, snapshot) {
                  final post = snapshot.data;
                  if (post == null || !_isOwner(post)) {
                    return const SizedBox.shrink();
                  }
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: 'Edit post',
                        icon: const Icon(Icons.edit_outlined),
                        onPressed: _busy ? null : () => _editPost(post),
                      ),
                      IconButton(
                        tooltip: 'Delete post',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: _busy ? null : () => _deletePost(post),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
          body: FutureBuilder<domain.Post>(
            key: ValueKey(_actor),
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                if (pendingDelete?.payload['method'] == 'DELETE') {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'The saved deletion has not been confirmed.',
                        ),
                        if (_mutationError != null) Text(_mutationError!),
                        FilledButton(
                          onPressed: _busy
                              ? null
                              : () => _deletePost(null, savedId: widget.postId),
                          child: const Text('Retry saved deletion'),
                        ),
                      ],
                    ),
                  );
                }
                return _PostDetailError(
                  message:
                      'Unable to load this post. It may be unavailable or awaiting publication checks.',
                  onRetry: () => setState(() {
                    _future = _loadPost();
                  }),
                );
              }

              final post = snapshot.data;
              if (post == null) {
                return _PostDetailError(
                  message: 'Post unavailable',
                  onRetry: () => setState(() {
                    _future = _loadPost();
                  }),
                );
              }

              return RefreshIndicator(
                onRefresh: () async {
                  final reloaded = _loadPost();
                  setState(() {
                    _future = reloaded;
                  });
                  await reloaded;
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    if (_mutationError != null) ...[
                      Text(
                        _mutationError!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    _PostHeader(post: post),
                    const SizedBox(height: 12),
                    Text(
                      post.text,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 8),
                    AuthorshipDisclosure(label: post.authorship.label.label),
                    if (post.moderationState == 'under_review') ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Under review. Publication checks are pending.',
                      ),
                    ],
                    if ((post.mediaUrls?.isNotEmpty ?? false)) ...[
                      const SizedBox(height: 12),
                      _PostMedia(mediaUrls: post.mediaUrls!),
                    ],
                    const SizedBox(height: 12),
                    // ── Reaction Bar (Phase 2) ──
                    ReactionBar(
                      contentId: post.id,
                      authorUserId: post.authorId,
                    ),
                    const SizedBox(height: 12),
                    TrustStripRow(
                      summary: FeedTrustSummary(
                        trustStatus: post.trustStatus,
                        timeline: FeedTrustTimeline(
                          created: post.timeline.created,
                          mediaChecked: post.timeline.mediaChecked,
                          moderation: post.timeline.moderation,
                          appeal: post.timeline.appeal,
                        ),
                        hasAppeal: post.hasAppeal,
                        proofSignalsProvided: post.proofSignalsProvided,
                        verifiedContextBadgeEligible:
                            post.verifiedContextBadgeEligible,
                        featuredEligible: post.featuredEligible,
                      ),
                      onTap: () => ReceiptDrawer.show(context, post.id),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _openComments(context, post),
                          icon: const Icon(Icons.chat_bubble_outline, size: 18),
                          label: Text('Comments (${post.commentCount})'),
                        ),
                        if (post.hasAppeal)
                          const Chip(
                            avatar: Icon(Icons.gavel, size: 16),
                            label: Text('Appeal open'),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _PostHeader extends StatelessWidget {
  const _PostHeader({required this.post});

  final domain.Post post;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Row(
      children: [
        CircleAvatar(
          child: Text(
            post.authorUsername.isNotEmpty
                ? post.authorUsername[0].toUpperCase()
                : '?',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AuthorProfileLink(
                userId: post.authorId,
                label: post.authorUsername,
                textStyle: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _formatTimeAgo(post.createdAt),
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _formatTimeAgo(DateTime value) {
    final now = DateTime.now();
    final diff = now.difference(value);
    if (diff.inDays > 0) {
      return '${diff.inDays}d ago';
    }
    if (diff.inHours > 0) {
      return '${diff.inHours}h ago';
    }
    if (diff.inMinutes > 0) {
      return '${diff.inMinutes}m ago';
    }
    return 'Just now';
  }
}

class _PostMedia extends StatelessWidget {
  const _PostMedia({required this.mediaUrls});

  final List<String> mediaUrls;

  @override
  Widget build(BuildContext context) {
    if (mediaUrls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Image.network(
            mediaUrls.first,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _MediaFallback(),
          ),
        ),
      );
    }

    return SizedBox(
      height: 160,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: mediaUrls.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 1,
              child: Image.network(
                mediaUrls[index],
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _MediaFallback(),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MediaFallback extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surfaceContainerHighest,
      alignment: Alignment.center,
      child: Icon(
        Icons.broken_image_outlined,
        color: scheme.onSurface.withValues(alpha: 0.6),
      ),
    );
  }
}

class _PostDetailError extends StatelessWidget {
  const _PostDetailError({
    required this.onRetry,
    this.message = 'Unable to load post right now.',
  });

  final VoidCallback onRetry;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

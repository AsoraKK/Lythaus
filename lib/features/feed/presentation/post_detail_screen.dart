// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/reactions/presentation/reaction_bar.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';
import 'package:lythaus/ui/components/trust_strip_row.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';

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

  @override
  void initState() {
    super.initState();
    _future = _loadPost();
  }

  Future<domain.Post> _loadPost() async {
    final repository = ref.read(postRepositoryProvider);
    final token = await ref.read(jwtProvider.future);
    return repository.getPost(postId: widget.postId, token: token);
  }

  Future<void> _openComments(BuildContext context, domain.Post post) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CommentThreadScreen(
          postId: post.id,
          initialCommentId: widget.initialCommentId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post')),
      body: FutureBuilder<domain.Post>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PostDetailError(
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
                _PostHeader(post: post),
                const SizedBox(height: 12),
                Text(post.text, style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 8),
                Chip(
                  avatar: const Icon(Icons.auto_awesome_outlined, size: 16),
                  label: Text(post.authorship.label.label),
                ),
                if ((post.mediaUrls?.isNotEmpty ?? false)) ...[
                  const SizedBox(height: 12),
                  _PostMedia(mediaUrls: post.mediaUrls!),
                ],
                const SizedBox(height: 12),
                // ── Reaction Bar (Phase 2) ──
                ReactionBar(contentId: post.id, authorUserId: post.authorId),
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
              Text(
                post.authorUsername,
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _formatTimeAgo(post.createdAt),
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurface.withValues(alpha: 0.65),
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

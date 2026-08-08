// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/feed/presentation/post_insights_panel.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/widgets/post_actions.dart';
import 'package:lythaus/widgets/moderation_badges.dart';
import 'package:lythaus/widgets/appeal_dialog.dart';
import 'package:lythaus/widgets/reputation_badge.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';

/// LYTHAUS POST CARD WITH MODERATION INTEGRATION
///
/// 🎯 Purpose: Example post card showing complete moderation integration
/// ✅ Features: Post content, actions, moderation badges, appeal functionality
/// 🎨 Design: Clean card layout with moderation status indicators
/// 🔗 Integration: Demonstrates use of all moderation widgets

class PostCard extends ConsumerStatefulWidget {
  final Post post;
  final bool isOwnPost;

  const PostCard({super.key, required this.post, this.isOwnPost = false});

  @override
  ConsumerState<PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<PostCard> {
  bool _bannerDismissed = false;

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;
    final scheme = context.colorScheme;

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: spacing.lg,
        vertical: spacing.sm,
      ),
      child: LythCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Moderation info banner (for own posts)
            if (widget.isOwnPost && !_bannerDismissed)
              ModerationInfoBanner(
                status: widget.post.moderationStatus,
                message: _getModerationMessage(),
                onAppeal: _canAppeal() ? _showAppealDialog : null,
                onDismiss: () {
                  setState(() {
                    _bannerDismissed = true;
                  });
                },
              ),

            // Post header
            Padding(
              padding: EdgeInsets.all(spacing.lg),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundImage: widget.post.author.avatarUrl != null
                        ? NetworkImage(widget.post.author.avatarUrl!)
                        : null,
                    child: widget.post.author.avatarUrl == null
                        ? Text(widget.post.author.displayName[0].toUpperCase())
                        : null,
                  ),
                  SizedBox(width: spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              widget.post.author.displayName,
                              style: Theme.of(context).textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            SizedBox(width: spacing.sm),
                            // Author reputation badge
                            ReputationBadge(
                              score: widget.post.author.reputationScore,
                              size: ReputationBadgeSize.small,
                            ),
                          ],
                        ),
                        Text(
                          _formatTimeAgo(widget.post.createdAt),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: scheme.onSurface.withValues(alpha: 0.6),
                              ),
                        ),
                        const SizedBox(height: 4),
                        Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(widget.post.authorshipLabel),
                        ),
                      ],
                    ),
                  ),

                  // Moderation badges
                  ModerationBadges(
                    status: widget.post.moderationStatus,
                    appealStatus: widget.post.appealStatus,
                    onAppeal: widget.isOwnPost && _canAppeal()
                        ? _showAppealDialog
                        : null,
                    isOwnContent: widget.isOwnPost,
                  ),
                ],
              ),
            ),

            // Post content
            if (widget.post.moderationStatus != ModerationStatus.hidden ||
                widget.isOwnPost)
              Padding(
                padding: EdgeInsets.symmetric(horizontal: spacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.post.title != null) ...[
                      Text(
                        widget.post.title!,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      SizedBox(height: spacing.sm),
                    ],
                    Text(
                      widget.post.content,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),

                    // Media content (if any)
                    if (widget.post.mediaUrls.isNotEmpty) ...[
                      SizedBox(height: spacing.md),
                      _buildMediaContent(),
                    ],
                  ],
                ),
              )
            else
              // Hidden content placeholder
              Container(
                width: double.infinity,
                padding: EdgeInsets.all(spacing.xxl),
                margin: EdgeInsets.symmetric(horizontal: spacing.lg),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(context.radius.md),
                  border: Border.all(
                    color: scheme.outline.withValues(alpha: 0.3),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.visibility_off,
                      size: 48,
                      color: scheme.onSurface.withValues(alpha: 0.5),
                    ),
                    SizedBox(height: spacing.sm),
                    Text(
                      'Content Hidden',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: scheme.onSurface.withValues(alpha: 0.7),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: spacing.xs),
                    Text(
                      'This content has been hidden due to community reports',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),

            SizedBox(height: spacing.lg),

            // Post actions
            if (widget.post.moderationStatus != ModerationStatus.hidden ||
                widget.isOwnPost)
              PostActions(
                contentId: widget.post.id,
                contentType: 'post',
                isLiked: widget.post.isLiked,
                likeCount: widget.post.likeCount,
                commentCount: widget.post.commentCount,
                onLike: () => _handleLike(),
                onComment: () => _handleComment(),
                onShare: () => _handleShare(),
              ),

            // Insights panel (only visible to post author or admin)
            // The panel itself handles authorization - returns empty if not allowed
            if (widget.isOwnPost) PostInsightsPanel(postId: widget.post.id),

            SizedBox(height: spacing.sm),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaContent() {
    if (widget.post.mediaUrls.isEmpty) return const SizedBox.shrink();
    final spacing = context.spacing;
    final scheme = context.colorScheme;

    return Container(
      height: 200,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(context.radius.md),
        color: scheme.surfaceContainerHigh,
      ),
      child: widget.post.mediaUrls.length == 1
          ? ClipRRect(
              borderRadius: BorderRadius.circular(context.radius.md),
              child: Image.network(
                widget.post.mediaUrls.first,
                width: double.infinity,
                height: 200,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  width: double.infinity,
                  height: 200,
                  color: scheme.surfaceContainerHigh,
                  child: Icon(
                    Icons.broken_image,
                    size: 48,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            )
          : ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: widget.post.mediaUrls.length,
              itemBuilder: (context, index) => Container(
                width: 150,
                margin: EdgeInsets.only(
                  left: index == 0 ? 0 : spacing.sm,
                  right: index == widget.post.mediaUrls.length - 1
                      ? 0
                      : spacing.sm,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(context.radius.md),
                  child: Image.network(
                    widget.post.mediaUrls[index],
                    width: 150,
                    height: 200,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      width: 150,
                      height: 200,
                      color: scheme.surfaceContainerHigh,
                      child: Icon(
                        Icons.broken_image,
                        color: scheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  String? _getModerationMessage() {
    switch (widget.post.moderationStatus) {
      case ModerationStatus.flagged:
        return 'Your post has been flagged by the community. It is still visible.';
      case ModerationStatus.hidden:
        final appealStatus = widget.post.appealStatus?.toLowerCase();
        if (appealStatus == 'pending' ||
            appealStatus == 'under_review' ||
            appealStatus == 'underreview') {
          return 'Your post is blocked pending an appeal outcome.';
        }
        return 'Your post has been blocked. You can appeal this decision if you believe it was made in error.';
      case ModerationStatus.communityRejected:
        return 'The community voted to keep your post blocked after your appeal.';
      case ModerationStatus.communityApproved:
        return 'Great news! The community voted to approve your appealed content.';
      default:
        return null;
    }
  }

  bool _canAppeal() {
    return (widget.post.moderationStatus == ModerationStatus.hidden ||
            widget.post.moderationStatus == ModerationStatus.flagged ||
            widget.post.moderationStatus ==
                ModerationStatus.communityRejected) &&
        widget.post.appealStatus == null;
  }

  Future<void> _showAppealDialog() async {
    final result = await showAppealDialog(
      context: context,
      contentId: widget.post.id,
      contentType: 'post',
      contentPreview:
          widget.post.title ?? widget.post.content.substring(0, 100),
      currentStatus: widget.post.moderationStatus,
    );

    if (result == true && mounted) {
      // Refresh post data or show success message
      setState(() {
        // Update appeal status - in a real app, you'd refresh from the server
      });
    }
  }

  void _handleLike() {
    // Guard: Block likes on compromised devices
    runWithDeviceGuard(context, ref, IntegrityUseCase.like, () async {
      try {
        await ref.read(postProvider(widget.post.id).notifier).toggleLike();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('Could not like post: $e')));
        }
      }
    });
  }

  void _handleComment() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CommentThreadScreen(postId: widget.post.id),
      ),
    );
  }

  void _handleShare() {
    // Copy shareable link to clipboard
    final link = 'https://lythaus.app/post/${widget.post.id}';
    Clipboard.setData(ClipboardData(text: link));
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Link copied to clipboard')));
    }
  }

  String _formatTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }
}

/// Post model for demonstration
class Post {
  final String id;
  final String? title;
  final String content;
  final Author author;
  final DateTime createdAt;
  final List<String> mediaUrls;
  final ModerationStatus moderationStatus;
  final String authorshipLabel;
  final String? appealStatus;
  final bool isLiked;
  final int likeCount;
  final int commentCount;

  const Post({
    required this.id,
    this.title,
    required this.content,
    required this.author,
    required this.createdAt,
    this.mediaUrls = const [],
    this.moderationStatus = ModerationStatus.clean,
    this.authorshipLabel = 'Under review',
    this.appealStatus,
    this.isLiked = false,
    this.likeCount = 0,
    this.commentCount = 0,
  });
}

/// Author model for demonstration
class Author {
  final String id;
  final String displayName;
  final String? avatarUrl;
  final int reputationScore;

  const Author({
    required this.id,
    required this.displayName,
    this.avatarUrl,
    this.reputationScore = 0,
  });

  /// Create Author from JSON response
  factory Author.fromJson(Map<String, dynamic> json) {
    return Author(
      id: json['id'] as String? ?? json['authorId'] as String,
      displayName:
          json['displayName'] as String? ??
          json['name'] as String? ??
          'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
      // API sends reputation_score, cached data uses reputationScore
      reputationScore:
          json['reputation_score'] as int? ??
          json['reputationScore'] as int? ??
          0,
    );
  }
}

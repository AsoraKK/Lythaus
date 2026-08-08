// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/components/lyth_chip.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/tier_badge.dart';
import 'package:lythaus/ui/components/trust_strip_row.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';

class FeedCard extends StatelessWidget {
  const FeedCard({
    super.key,
    required this.item,
    this.onTap,
    this.showSource = true,
    this.canEdit = false,
    this.onEdit,
  });

  final FeedItem item;
  final VoidCallback? onTap;
  final bool showSource;
  final bool canEdit;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final sourceLabel =
        (item.sourceName != null && item.sourceName!.trim().isNotEmpty)
        ? item.sourceName!.trim()
        : item.author;
    final headline = theme.textTheme.titleMedium?.copyWith(
      fontWeight: FontWeight.w700,
    );
    final body = theme.textTheme.bodyMedium?.copyWith(height: 1.3);

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: spacing.lg,
        vertical: spacing.xs,
      ),
      child: LythCard.clickable(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (item.isPinned)
                  Padding(
                    padding: EdgeInsets.only(right: spacing.xs),
                    child: Icon(
                      Icons.push_pin_outlined,
                      size: 16,
                      color: theme.colorScheme.secondary,
                    ),
                  ),
                Expanded(child: Text(item.title, style: headline)),
                if (showSource)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(sourceLabel, style: theme.textTheme.labelMedium),
                      if (item.sourceUrl != null && item.sourceUrl!.isNotEmpty)
                        Padding(
                          padding: EdgeInsets.only(left: spacing.xs),
                          child: Icon(
                            Icons.link,
                            size: 14,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                    ],
                  ),
                if (canEdit && onEdit != null)
                  PopupMenuButton<String>(
                    tooltip: 'Post actions',
                    onSelected: (value) {
                      if (value == 'edit') {
                        onEdit!.call();
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem<String>(
                        value: 'edit',
                        child: Text('Edit post'),
                      ),
                    ],
                    icon: const Icon(Icons.more_vert, size: 18),
                  ),
              ],
            ),
            SizedBox(height: spacing.xs),
            if (item.imageUrl != null || item.videoThumbnailUrl != null)
              _MediaPreview(
                imageUrl: item.imageUrl ?? item.videoThumbnailUrl!,
                isVideo: item.videoThumbnailUrl != null,
              ),
            if (item.body.isNotEmpty) ...[
              SizedBox(height: spacing.xs),
              Text(item.body, style: body),
            ],
            SizedBox(height: spacing.xs),
            Wrap(
              spacing: spacing.xs,
              runSpacing: spacing.xs,
              children: [
                TierBadge(label: _contentLabel(item.contentType)),
                LythChip(label: item.authorshipLabel),
                ...item.tags.map((tag) => LythChip(label: tag)),
              ],
            ),
            TrustStripRow(
              summary: item.trustSummary,
              onTap: () => ReceiptDrawer.show(context, item.id),
            ),
          ],
        ),
      ),
    );
  }

  String _contentLabel(ContentType type) {
    switch (type) {
      case ContentType.text:
        return 'Text';
      case ContentType.image:
        return 'Image';
      case ContentType.video:
        return 'Video';
      case ContentType.mixed:
        return 'Mixed';
    }
  }
}

class _MediaPreview extends StatelessWidget {
  const _MediaPreview({required this.imageUrl, this.isVideo = false});

  final String imageUrl;
  final bool isVideo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final scheme = context.colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(context.radius.lg),
      child: Stack(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                color: theme.colorScheme.surfaceContainerHighest.withValues(
                  alpha: 0.4,
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.broken_image_outlined,
                  size: 32,
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
          ),
          if (isVideo)
            Positioned(
              right: spacing.sm,
              bottom: spacing.sm,
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: spacing.sm,
                  vertical: spacing.xs / 2,
                ),
                decoration: BoxDecoration(
                  color: scheme.onSurface.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(context.radius.pill),
                ),
                child: Row(
                  children: [
                    Icon(Icons.play_arrow, size: 16, color: scheme.surface),
                    SizedBox(width: spacing.xs),
                    Text(
                      'Preview',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.surface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

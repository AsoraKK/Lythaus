// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/features/profile/domain/public_author_label.dart';
import 'package:intl/intl.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/trust_strip_row.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';
import 'package:lythaus/ui/components/authorship_disclosure.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';

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
    final authorLabel = publicAuthorLabel(item.author, authorId: item.authorId);
    final sourceLabel = publicAuthorLabel(
      item.sourceName,
      authorId: item.authorId,
    );
    final headline = theme.textTheme.titleMedium?.copyWith(
      fontWeight: FontWeight.w700,
    );
    final body = theme.textTheme.bodyLarge;

    final author = item.authorId?.trim().isNotEmpty == true
        ? AuthorProfileLink(
            userId: item.authorId!,
            label: authorLabel,
            textStyle: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          )
        : Text(authorLabel, style: theme.textTheme.titleSmall);
    final date = Tooltip(
      message: DateFormat.yMMMd().add_jm().format(item.publishedAt.toLocal()),
      child: Text(
        DateFormat.yMMMd().format(item.publishedAt.toLocal()),
        style: theme.textTheme.bodySmall,
      ),
    );

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: spacing.md,
        vertical: spacing.xs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _FeedEntrySurface(
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
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          LayoutBuilder(
                            builder: (context, constraints) {
                              final stacked =
                                  MediaQuery.textScalerOf(context).scale(14) >
                                      18 ||
                                  constraints.maxWidth < 260;
                              if (stacked) {
                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [author, date],
                                );
                              }
                              return Row(
                                children: [
                                  Expanded(child: author),
                                  SizedBox(width: spacing.sm),
                                  date,
                                ],
                              );
                            },
                          ),
                          if (showSource &&
                              sourceLabel != authorLabel &&
                              sourceLabel != 'Lythaus member')
                            Wrap(
                              spacing: spacing.xs,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text(
                                  'Source: $sourceLabel',
                                  style: theme.textTheme.bodySmall,
                                ),
                                if (item.sourceUrl?.isNotEmpty ?? false)
                                  Icon(
                                    Icons.link,
                                    size: 16,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                              ],
                            ),
                        ],
                      ),
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
                if (item.isNews && item.title.isNotEmpty) ...[
                  SizedBox(height: spacing.sm),
                  Text(item.title, style: headline),
                ],
                if (item.imageUrl != null || item.videoThumbnailUrl != null)
                  Padding(
                    padding: EdgeInsets.only(top: spacing.sm),
                    child: _MediaPreview(
                      imageUrl: item.imageUrl ?? item.videoThumbnailUrl!,
                      isVideo: item.videoThumbnailUrl != null,
                    ),
                  ),
                if (item.body.isNotEmpty) ...[
                  SizedBox(height: spacing.sm),
                  Text(item.body, style: body),
                ],
                SizedBox(height: spacing.sm),
                TrustStripRow(
                  key: ValueKey('trust-${item.id}'),
                  summary: item.trustSummary,
                  onTap: () => ReceiptDrawer.show(context, item.id),
                  compact: true,
                  leading: AuthorshipDisclosure(
                    label: item.authorshipLabel,
                    classificationSource: item.classificationSource,
                    classificationState: item.classificationState,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FeedEntrySurface extends StatefulWidget {
  const _FeedEntrySurface({required this.child, required this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  State<_FeedEntrySurface> createState() => _FeedEntrySurfaceState();
}

class _FeedEntrySurfaceState extends State<_FeedEntrySurface> {
  final _focusNode = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_updateFocus);
  }

  void _updateFocus() {
    final focused = _focusNode.hasPrimaryFocus;
    if (_focused != focused) setState(() => _focused = focused);
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(context.radius.md),
      side: BorderSide(
        color: _focused
            ? context.colorScheme.primary
            : context.colorScheme.outlineVariant,
        width: _focused ? 2 : 1,
      ),
    );

    return Material(
      color: context.colorScheme.surfaceContainerLow,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        focusNode: _focusNode,
        customBorder: shape,
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: context.spacing.md,
            vertical: context.spacing.md,
          ),
          child: widget.child,
        ),
      ),
    );
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.broken_image_outlined,
                      color: scheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 8),
                    const Text('Media unavailable'),
                  ],
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

// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:intl/intl.dart';
import 'package:lythaus/features/profile/domain/public_author_label.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/ui/components/feed_swipe_region.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';

class FeedCard extends StatefulWidget {
  const FeedCard({
    super.key,
    required this.item,
    this.onTap,
    this.showSource = true,
    this.canEdit = false,
    this.onEdit,
    this.saveAction,
    this.actions,
  });
  final FeedItem item;
  final VoidCallback? onTap;
  final bool showSource;
  final bool canEdit;
  final VoidCallback? onEdit;
  final Widget? saveAction;
  final Widget? actions;

  @override
  State<FeedCard> createState() => _FeedCardState();
}

class _FeedCardState extends State<FeedCard> {
  bool _expanded = false;
  bool _focused = false;

  @override
  void didUpdateWidget(FeedCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.id != widget.item.id) _expanded = false;
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final theme = Theme.of(context);
    final label = publicAuthorLabel(item.author, authorId: item.authorId);
    final media = item.imageUrl ?? item.videoThumbnailUrl;
    final source = Uri.tryParse(item.sourceUrl ?? '');
    final hasSource =
        widget.showSource &&
        source != null &&
        ['https', 'http'].contains(source.scheme) &&
        source.host.isNotEmpty &&
        source.userInfo.isEmpty;
    final author = item.authorId?.trim().isNotEmpty == true
        ? AuthorProfileLink(
            userId: item.authorId!,
            label: label,
            textStyle: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          )
        : Text(
            label,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          );
    final date = Tooltip(
      message: DateFormat.yMMMd().add_jm().format(item.publishedAt.toLocal()),
      child: Text(
        DateFormat.MMMd().format(item.publishedAt.toLocal()),
        style: theme.textTheme.bodySmall,
      ),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
        final wide = constraints.maxWidth / scale >= 800;
        final metadata = FeedSwipeExclusion(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (wide) ...[
                author,
                const SizedBox(height: 8),
                date,
              ] else
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    author,
                    date,
                    if (item.isPinned)
                      const Tooltip(
                        message: 'Pinned post',
                        child: Icon(Icons.push_pin_outlined, size: 16),
                      ),
                  ],
                ),
              if (wide && item.isPinned)
                const Tooltip(
                  message: 'Pinned post',
                  child: Icon(Icons.push_pin_outlined, size: 16),
                ),
              if (hasSource)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextButton(
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      alignment: Alignment.centerLeft,
                    ),
                    onPressed: () async {
                      try {
                        if (await launchUrl(
                          source,
                          mode: LaunchMode.externalApplication,
                        )) {
                          return;
                        }
                      } catch (_) {}
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Couldn’t open the source.'),
                          ),
                        );
                      }
                    },
                    child: Text(
                      'Source: ${item.sourceName?.trim().isNotEmpty == true ? item.sourceName : source.host}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
        final content = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Material(
              color: LythSemanticColors.clear,
              shape: RoundedRectangleBorder(
                side: BorderSide(
                  color: _focused
                      ? theme.colorScheme.primary
                      : LythSemanticColors.clear,
                  width: 2,
                ),
              ),
              child: InkWell(
                onTap: widget.onTap,
                onFocusChange: (focused) => setState(() => _focused = focused),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (item.title.trim().isNotEmpty) ...[
                      Semantics(
                        header: true,
                        child: Text(
                          item.title,
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                            height: 1.35,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (item.body.isNotEmpty)
                      LayoutBuilder(
                        builder: (context, bodyConstraints) {
                          final style = theme.textTheme.bodyLarge?.copyWith(
                            fontSize: 18,
                            height: 1.65,
                          );
                          final maxLines = wide ? 8 : 6;
                          final painter = TextPainter(
                            text: TextSpan(text: item.body, style: style),
                            maxLines: maxLines,
                            textDirection: Directionality.of(context),
                            textScaler: MediaQuery.textScalerOf(context),
                          )..layout(maxWidth: bodyConstraints.maxWidth);
                          final expandable = painter.didExceedMaxLines;
                          painter.dispose();
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.body,
                                style: style,
                                maxLines: _expanded ? null : maxLines,
                                overflow: _expanded
                                    ? null
                                    : TextOverflow.ellipsis,
                              ),
                              if (expandable)
                                FeedSwipeExclusion(
                                  child: TextButton(
                                    style: TextButton.styleFrom(
                                      padding: EdgeInsets.zero,
                                      alignment: Alignment.centerLeft,
                                    ),
                                    onPressed:
                                        widget.onTap ??
                                        () => setState(
                                          () => _expanded = !_expanded,
                                        ),
                                    child: Text(
                                      widget.onTap != null
                                          ? 'Read full post'
                                          : _expanded
                                          ? 'Show less'
                                          : 'See more',
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                  ],
                ),
              ),
            ),
            if (media != null && media.isNotEmpty) ...[
              const SizedBox(height: 16),
              FeedSwipeExclusion(
                child: _MediaPreview(
                  imageUrl: media,
                  isVideo: item.videoThumbnailUrl != null,
                ),
              ),
            ],
            if (item.isPublication &&
                item.backingPostId != null &&
                widget.onTap != null)
              FeedSwipeExclusion(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: widget.onTap,
                    label: const Text('View post'),
                    icon: const Icon(Icons.arrow_forward, size: 18),
                    iconAlignment: IconAlignment.end,
                  ),
                ),
              ),
            if (item.trustSummary.trustStatus == 'under_appeal')
              Text('Appeal in progress', style: theme.textTheme.bodySmall),
            if (item.trustSummary.trustStatus == 'actioned')
              Text('Content restricted', style: theme.textTheme.bodySmall),
            if (item.trustSummary.timeline.moderation == 'pending_review')
              Text('Review pending', style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            FeedSwipeExclusion(
              child:
                  widget.actions ??
                  Row(
                    children: [
                      if (widget.saveAction != null) widget.saveAction!,
                      const Spacer(),
                      PopupMenuButton<String>(
                        tooltip: 'Post actions',
                        onSelected: (action) {
                          if (action == 'details') {
                            ReceiptDrawer.show(context, item.id);
                          }
                          if (action == 'edit') widget.onEdit?.call();
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(
                            value: 'details',
                            child: Text('Post details'),
                          ),
                          if (widget.canEdit && widget.onEdit != null)
                            const PopupMenuItem(
                              value: 'edit',
                              child: Text('Edit post'),
                            ),
                        ],
                        icon: const Icon(Icons.more_horiz),
                      ),
                    ],
                  ),
            ),
          ],
        );
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 144, child: metadata),
                    const SizedBox(width: 32),
                    Expanded(child: content),
                  ],
                )
              else ...[
                metadata,
                const SizedBox(height: 12),
                content,
              ],
              const SizedBox(height: 28),
              Divider(height: 1, color: theme.colorScheme.outlineVariant),
            ],
          ),
        );
      },
    );
  }
}

class _MediaPreview extends StatelessWidget {
  const _MediaPreview({required this.imageUrl, required this.isVideo});
  final String imageUrl;
  final bool isVideo;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.zero,
    child: Stack(
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Image.network(
            imageUrl,
            fit: BoxFit.contain,
            semanticLabel: isVideo ? 'Post video preview' : 'Post image',
            loadingBuilder: (context, child, progress) => progress == null
                ? child
                : const Center(
                    child: CircularProgressIndicator(
                      semanticsLabel: 'Loading post image',
                    ),
                  ),
            errorBuilder: (_, __, ___) => ColoredBox(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: const Center(child: Text('Media unavailable')),
            ),
          ),
        ),
        if (isVideo)
          const Positioned(
            right: 12,
            bottom: 12,
            child: Chip(
              avatar: Icon(Icons.videocam_outlined, size: 18),
              label: Text('Preview'),
            ),
          ),
      ],
    ),
  );
}

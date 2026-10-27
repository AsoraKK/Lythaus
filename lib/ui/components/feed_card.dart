// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:intl/intl.dart';
import 'package:lythaus/features/profile/domain/public_author_label.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/ui/components/authorship_disclosure.dart';
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              ExcludeSemantics(
                child: CircleAvatar(
                  radius: 20,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  foregroundColor: theme.colorScheme.onSurfaceVariant,
                  child: const Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: item.authorId?.trim().isNotEmpty == true
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
                      ),
              ),
              if (item.isPinned)
                const Tooltip(
                  message: 'Pinned post',
                  child: Icon(Icons.push_pin_outlined, size: 18),
                ),
              const SizedBox(width: 8),
              Flexible(
                child: Tooltip(
                  message: DateFormat.yMMMd().add_jm().format(
                    item.publishedAt.toLocal(),
                  ),
                  child: Text(
                    DateFormat.MMMd().add_jm().format(
                      item.publishedAt.toLocal(),
                    ),
                    textAlign: TextAlign.end,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              ),
              if (widget.saveAction != null) widget.saveAction!,
            ],
          ),
          const SizedBox(height: 10),
          Material(
            color: LythSemanticColors.clear,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
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
              borderRadius: BorderRadius.circular(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (media != null && media.isNotEmpty) ...[
                    _MediaPreview(
                      imageUrl: media,
                      isVideo: item.videoThumbnailUrl != null,
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (item.title.trim().isNotEmpty) ...[
                    Semantics(
                      header: true,
                      child: Text(
                        item.title,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          height: 1.25,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (item.body.isNotEmpty)
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final style = theme.textTheme.bodyLarge?.copyWith(
                          height: 1.5,
                        );
                        final painter = TextPainter(
                          text: TextSpan(text: item.body, style: style),
                          maxLines: 3,
                          textDirection: Directionality.of(context),
                          textScaler: MediaQuery.textScalerOf(context),
                        )..layout(maxWidth: constraints.maxWidth);
                        final expandable = painter.didExceedMaxLines;
                        painter.dispose();
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.body,
                              style: style,
                              maxLines: _expanded ? null : 3,
                              overflow: _expanded
                                  ? null
                                  : TextOverflow.ellipsis,
                            ),
                            if (expandable)
                              TextButton(
                                onPressed: () =>
                                    setState(() => _expanded = !_expanded),
                                child: Text(
                                  _expanded ? 'Show less' : 'See more',
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
          const SizedBox(height: 8),
          AuthorshipDisclosure(
            label: item.authorshipLabel,
            classificationSource: item.classificationSource,
            classificationState: item.classificationState,
          ),
          if (item.trustSummary.trustStatus == 'under_appeal')
            Text('Appeal in progress', style: theme.textTheme.bodySmall),
          if (item.trustSummary.trustStatus == 'actioned')
            Text('Content restricted', style: theme.textTheme.bodySmall),
          if (item.trustSummary.timeline.moderation == 'pending_review')
            Text('Review pending', style: theme.textTheme.bodySmall),
          const SizedBox(height: 4),
          widget.actions ??
              Align(
                alignment: Alignment.centerRight,
                child: PopupMenuButton<String>(
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
                    if (widget.showSource &&
                        item.sourceName?.isNotEmpty == true)
                      PopupMenuItem(
                        enabled: false,
                        child: Text('Source: ${item.sourceName}'),
                      ),
                    if (widget.canEdit && widget.onEdit != null)
                      const PopupMenuItem(
                        value: 'edit',
                        child: Text('Edit post'),
                      ),
                  ],
                  icon: const Icon(Icons.more_horiz),
                ),
              ),
          const SizedBox(height: 8),
          Divider(color: theme.colorScheme.outlineVariant),
        ],
      ),
    );
  }
}

class _MediaPreview extends StatelessWidget {
  const _MediaPreview({required this.imageUrl, required this.isVideo});
  final String imageUrl;
  final bool isVideo;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(20),
    child: Stack(
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Image.network(
            imageUrl,
            fit: BoxFit.cover,
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

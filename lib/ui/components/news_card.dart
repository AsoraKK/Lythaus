// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/theme/spacing.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/tier_badge.dart';

class NewsCard extends StatelessWidget {
  const NewsCard({
    super.key,
    required this.item,
    this.canEdit = false,
    this.onEdit,
    this.onTap,
  });

  final FeedItem item;
  final bool canEdit;
  final VoidCallback? onEdit;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Stack(
      children: [
        FeedCard(
          item: item,
          onTap: onTap,
          showSource: true,
          canEdit: canEdit,
          onEdit: onEdit,
        ),
        const Positioned(
          top: Spacing.sm,
          right: Spacing.lg,
          child: TierBadge(label: 'News', highlight: true),
        ),
        if (item.isPinned)
          Positioned(
            top: Spacing.sm,
            left: Spacing.sm,
            child: Icon(
              Icons.workspace_premium_outlined,
              color: theme.colorScheme.secondary,
            ),
          ),
      ],
    );
  }
}

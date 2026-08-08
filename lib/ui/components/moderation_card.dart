// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class ModerationCard extends StatelessWidget {
  const ModerationCard({
    super.key,
    required this.caseItem,
    this.onApprove,
    this.onReject,
  });

  final ModerationCase caseItem;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.symmetric(
        horizontal: Spacing.md,
        vertical: Spacing.xs,
      ),
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  caseItem.reason,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Chip(
                  label: const Text('Needs review'),
                  backgroundColor: theme.colorScheme.secondary.withValues(
                    alpha: 0.16,
                  ),
                ),
              ],
            ),
            const SizedBox(height: Spacing.xs),
            Text(caseItem.anonymizedContent, style: theme.textTheme.bodyMedium),
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                Icon(
                  Icons.stars_rounded,
                  size: 18,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: Spacing.xxs),
                Text('${caseItem.xpReward} XP'),
                const Spacer(),
                OutlinedButton(
                  onPressed: onReject,
                  child: const Text('Reject'),
                ),
                const SizedBox(width: Spacing.xs),
                FilledButton(
                  onPressed: onApprove,
                  child: const Text('Approve'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

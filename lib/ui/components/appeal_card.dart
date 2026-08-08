// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class AppealCard extends StatelessWidget {
  const AppealCard({
    super.key,
    required this.appeal,
    this.onVoteFor,
    this.onVoteAgainst,
  });

  final AppealCase appeal;
  final VoidCallback? onVoteFor;
  final VoidCallback? onVoteAgainst;

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
            Text(
              appeal.authorStatement,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: Spacing.xs),
            Text(appeal.evidence, style: theme.textTheme.bodyMedium),
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                _voteChip(
                  context,
                  Icons.thumb_up_outlined,
                  appeal.votesFor,
                  appeal.weightFor,
                ),
                const SizedBox(width: Spacing.sm),
                _voteChip(
                  context,
                  Icons.thumb_down_outlined,
                  appeal.votesAgainst,
                  appeal.weightAgainst,
                ),
                const Spacer(),
                Text(
                  _decisionLabel(appeal.decision),
                  style: theme.textTheme.labelLarge,
                ),
              ],
            ),
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: onVoteAgainst,
                  icon: const Icon(Icons.thumb_down_alt_outlined, size: 18),
                  label: const Text('Reject'),
                ),
                const SizedBox(width: Spacing.xs),
                FilledButton.icon(
                  onPressed: onVoteFor,
                  icon: const Icon(Icons.thumb_up_alt_outlined, size: 18),
                  label: const Text('Approve'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _decisionLabel(ModerationDecision decision) {
    switch (decision) {
      case ModerationDecision.pending:
        return 'Pending';
      case ModerationDecision.approved:
        return 'Approved';
      case ModerationDecision.rejected:
        return 'Rejected';
    }
  }

  Widget _voteChip(
    BuildContext context,
    IconData icon,
    int count,
    double weight,
  ) {
    final theme = Theme.of(context);
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text('$count • ${(weight * 100).round()}%'),
      backgroundColor: theme.colorScheme.surfaceContainerHighest.withValues(
        alpha: 0.24,
      ),
    );
  }
}

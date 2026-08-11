// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS REVIEWER PANEL PROGRESS INDICATOR
///
/// 🎯 Purpose: Display independent reviewer-panel progress and statistics
/// 🔍 Single Responsibility: Progress visualization only

class VotingProgressIndicator extends StatelessWidget {
  final VotingProgress progress;

  const VotingProgressIndicator({super.key, required this.progress});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildHeader(context),
        SizedBox(height: context.spacing.sm),
        if (progress.totalVotes > 0) ...[
          _buildProgressBar(context),
          SizedBox(height: context.spacing.xs),
          _buildVoteBreakdown(context),
        ] else ...[
          _buildWaitingMessage(context),
        ],
      ],
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        Icon(
          Icons.groups_outlined,
          size: 16,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(width: context.spacing.sm),
        Text(
          'Independent reviewer panel',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Text(
          '${progress.totalVotes} reviewer decisions',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }

  Widget _buildProgressBar(BuildContext context) {
    final scheme = context.colorScheme;
    return LinearProgressIndicator(
      value: progress.approvalRate / 100,
      backgroundColor: scheme.error.withValues(alpha: 0.2),
      valueColor: AlwaysStoppedAnimation<Color>(scheme.primary),
    );
  }

  Widget _buildVoteBreakdown(BuildContext context) {
    final scheme = context.colorScheme;
    return Row(
      children: [
        Text(
          '${progress.approveVotes} overturn',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: scheme.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const Spacer(),
        Text(
          '${progress.rejectVotes} uphold',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: scheme.error,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildWaitingMessage(BuildContext context) {
    return Text(
      'Waiting for assigned trained reviewer decisions...',
      style: Theme.of(
        context,
      ).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
    );
  }
}

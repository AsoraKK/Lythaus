// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS VOTING PROGRESS INDICATOR
///
/// 🎯 Purpose: Display voting progress with progress bar and statistics
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
        if (progress.timeRemaining != null) ...[
          SizedBox(height: context.spacing.xs),
          _buildTimeRemaining(context),
        ],
      ],
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        Icon(
          Icons.how_to_vote,
          size: 16,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(width: context.spacing.sm),
        Text(
          'Community Voting Progress',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Text(
          '${progress.totalVotes} votes',
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
          '${progress.approveVotes} approve',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: scheme.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const Spacer(),
        Text(
          '${progress.rejectVotes} reject',
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
      'Waiting for community votes...',
      style: Theme.of(
        context,
      ).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
    );
  }

  Widget _buildTimeRemaining(BuildContext context) {
    return Text(
      'Time remaining: ${progress.timeRemaining ?? '5m window'}',
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
        color: Theme.of(context).colorScheme.outline,
      ),
    );
  }
}

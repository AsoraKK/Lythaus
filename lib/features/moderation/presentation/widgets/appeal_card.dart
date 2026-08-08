// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/presentation/widgets/voting_status_badge.dart';
import 'package:lythaus/features/moderation/presentation/widgets/urgency_indicator.dart';
import 'package:lythaus/features/moderation/presentation/widgets/voting_progress_indicator.dart';
import 'package:lythaus/features/core/utils/date_formatter.dart';
import 'package:lythaus/features/core/utils/content_type_helper.dart';

/// LYTHAUS APPEAL CARD WIDGET
///
/// 🎯 Purpose: Display individual appeal in a card format
/// ✅ Features: Status badge, urgency indicator, progress tracking
/// 🔍 Single Responsibility: Appeal card presentation only
/// 📱 Platform: Flutter with Material Design

class AppealCard extends StatelessWidget {
  final Appeal appeal;
  final bool showProgress;
  final VoidCallback? onTap;
  final VoidCallback? onViewDetails;

  const AppealCard({
    super.key,
    required this.appeal,
    this.showProgress = false,
    this.onTap,
    this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(context),
              const SizedBox(height: 12),
              _buildContentInfo(context),
              const SizedBox(height: 12),
              _buildContentPreview(context),
              const SizedBox(height: 12),
              _buildAppealReason(context),
              if (showProgress && appeal.votingProgress != null) ...[
                const SizedBox(height: 12),
                VotingProgressIndicator(progress: appeal.votingProgress!),
              ],
              const SizedBox(height: 12),
              _buildActionButtons(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        VotingStatusBadge(status: appeal.votingStatus),
        const Spacer(),
        Text(
          DateFormatter.formatRelative(appeal.submittedAt),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }

  Widget _buildContentInfo(BuildContext context) {
    return Row(
      children: [
        Icon(
          ContentTypeHelper.getIcon(appeal.contentType),
          size: 16,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: 8),
        Text(
          appeal.contentType.toUpperCase(),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        const SizedBox(width: 16),
        UrgencyIndicator(score: appeal.urgencyScore),
      ],
    );
  }

  Widget _buildContentPreview(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (appeal.contentTitle != null) ...[
          Text(
            appeal.contentTitle!,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
        ],
        Text(
          appeal.contentPreview,
          style: Theme.of(context).textTheme.bodyMedium,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildAppealReason(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Appeal Type: ${appeal.appealType.replaceAll('_', ' ')}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            appeal.appealReason,
            style: Theme.of(context).textTheme.bodyMedium,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    return Row(
      children: [
        TextButton.icon(
          onPressed: onViewDetails,
          icon: const Icon(Icons.visibility),
          label: const Text('View Details'),
        ),
        const Spacer(),
        if (appeal.votingStatus == VotingStatus.active)
          Icon(
            Icons.schedule,
            size: 16,
            color: Theme.of(context).colorScheme.primary,
          ),
      ],
    );
  }
}

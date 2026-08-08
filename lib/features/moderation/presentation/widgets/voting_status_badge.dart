// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS VOTING STATUS BADGE
///
/// 🎯 Purpose: Display voting status with color-coded badge
/// 🔍 Single Responsibility: Status visualization only

class VotingStatusBadge extends StatelessWidget {
  final VotingStatus status;

  const VotingStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final statusInfo = _getStatusInfo(context, status);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.md,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: statusInfo.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(context.radius.pill),
        border: Border.all(color: statusInfo.color),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusInfo.icon, size: 16, color: statusInfo.color),
          SizedBox(width: context.spacing.xs),
          Text(
            statusInfo.label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: statusInfo.color,
            ),
          ),
        ],
      ),
    );
  }

  StatusInfo _getStatusInfo(BuildContext context, VotingStatus status) {
    final scheme = context.colorScheme;
    switch (status) {
      case VotingStatus.active:
        return StatusInfo(
          color: scheme.primary,
          icon: Icons.how_to_vote,
          label: 'Active Voting',
        );
      case VotingStatus.quorumReached:
        return StatusInfo(
          color: scheme.tertiary,
          icon: Icons.check_circle,
          label: 'Quorum Reached',
        );
      case VotingStatus.timeExpired:
        return StatusInfo(
          color: scheme.onSurface.withValues(alpha: 0.6),
          icon: Icons.access_time,
          label: 'Time Expired',
        );
      case VotingStatus.resolved:
        return StatusInfo(
          color: scheme.secondary,
          icon: Icons.verified,
          label: 'Resolved',
        );
    }
  }
}

class StatusInfo {
  final Color color;
  final IconData icon;
  final String label;

  StatusInfo({required this.color, required this.icon, required this.label});
}

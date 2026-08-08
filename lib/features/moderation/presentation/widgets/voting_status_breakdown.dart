// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/presentation/widgets/voting_status_badge.dart';

/// LYTHAUS VOTING STATUS BREAKDOWN WIDGET
///
/// 🎯 Purpose: Display breakdown of appeals by voting status
/// 🔍 Single Responsibility: Status analytics only

class VotingStatusBreakdown extends StatelessWidget {
  final List<Appeal> appeals;

  const VotingStatusBreakdown({super.key, required this.appeals});

  @override
  Widget build(BuildContext context) {
    final statusCounts = _calculateStatusBreakdown();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Appeals by Status',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ...statusCounts.entries.map((entry) => _buildStatusRow(entry)),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusRow(MapEntry<VotingStatus, int> entry) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          VotingStatusBadge(status: entry.key),
          const Spacer(),
          Text(
            entry.value.toString(),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Map<VotingStatus, int> _calculateStatusBreakdown() {
    final statusCounts = <VotingStatus, int>{};
    for (final appeal in appeals) {
      statusCounts[appeal.votingStatus] =
          (statusCounts[appeal.votingStatus] ?? 0) + 1;
    }
    return statusCounts;
  }
}

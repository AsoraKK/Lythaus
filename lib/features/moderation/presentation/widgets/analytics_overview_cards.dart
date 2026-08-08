// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS ANALYTICS OVERVIEW CARDS
///
/// 🎯 Purpose: Display overview statistics for appeals
/// 🔍 Single Responsibility: Analytics visualization only

class AnalyticsOverviewCards extends StatelessWidget {
  final List<Appeal> appeals;

  const AnalyticsOverviewCards({super.key, required this.appeals});

  @override
  Widget build(BuildContext context) {
    final analytics = _calculateAnalytics();

    return Row(
      children: [
        Expanded(
          child: _buildOverviewCard(
            context,
            'Total Appeals',
            analytics.totalAppeals.toString(),
            Icons.list,
            Colors.blue,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildOverviewCard(
            context,
            'Resolution Rate',
            '${analytics.resolutionRate.toStringAsFixed(1)}%',
            Icons.trending_up,
            Colors.green,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildOverviewCard(
            context,
            'Active',
            analytics.activeAppeals.toString(),
            Icons.pending_actions,
            Colors.orange,
          ),
        ),
      ],
    );
  }

  Widget _buildOverviewCard(
    BuildContext context,
    String title,
    String value,
    IconData icon,
    Color color,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              title,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  AnalyticsData _calculateAnalytics() {
    final totalAppeals = appeals.length;
    final activeAppeals = appeals
        .where((a) => a.votingStatus == VotingStatus.active)
        .length;
    final resolvedAppeals = appeals
        .where((a) => a.votingStatus == VotingStatus.resolved)
        .length;
    final resolutionRate = totalAppeals > 0
        ? (resolvedAppeals / totalAppeals * 100)
        : 0.0;

    return AnalyticsData(
      totalAppeals: totalAppeals,
      activeAppeals: activeAppeals,
      resolvedAppeals: resolvedAppeals,
      resolutionRate: resolutionRate,
    );
  }
}

class AnalyticsData {
  final int totalAppeals;
  final int activeAppeals;
  final int resolvedAppeals;
  final double resolutionRate;

  AnalyticsData({
    required this.totalAppeals,
    required this.activeAppeals,
    required this.resolvedAppeals,
    required this.resolutionRate,
  });
}

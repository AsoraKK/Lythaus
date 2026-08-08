// ignore_for_file: public_member_api_docs

/// LYTHAUS POST INSIGHTS PANEL WIDGET
///
/// 🎯 Purpose: Display sanitized moderation insights for post authors/admins
/// 🏗️ Architecture: Presentation layer - pure UI widget
/// 🔐 Privacy: Only shows risk band, config version, appeal status
///            NO raw scores, thresholds, or probabilities
/// 📱 Platform: Flutter with Riverpod
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/feed/application/post_insights_providers.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

/// Insights panel for post details screen
///
/// Only renders when insights are successfully fetched.
/// Returns SizedBox.shrink() for access denied, not found, or error cases.
/// This ensures no UI hints are shown to unauthorized users.
class PostInsightsPanel extends ConsumerWidget {
  final String postId;

  const PostInsightsPanel({super.key, required this.postId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncResult = ref.watch(postInsightsProvider(postId));

    return asyncResult.when(
      loading: () => _buildLoadingSkeleton(context),
      error: (_, __) => const SizedBox.shrink(),
      data: (result) {
        if (result is InsightsSuccess) {
          return _InsightsPanelContent(insights: result.insights);
        }
        // Access denied, not found, or error - render nothing
        return const SizedBox.shrink();
      },
    );
  }

  Widget _buildLoadingSkeleton(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(
                  Icons.insights,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'Insights',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

/// Internal content widget for displaying insights data
class _InsightsPanelContent extends StatelessWidget {
  final PostInsights insights;

  const _InsightsPanelContent({required this.insights});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              children: [
                Icon(Icons.insights, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  'Insights',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Risk band and decision
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _RiskBandChip(riskBand: insights.riskBand),
                _buildConfigVersionChip(context),
              ],
            ),
            const SizedBox(height: 12),

            // Appeal status
            _buildAppealRow(context),

            // Decided at timestamp
            const SizedBox(height: 8),
            Text(
              'Decided: ${_formatDateTime(insights.decidedAt)}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfigVersionChip(BuildContext context) {
    return Chip(
      label: Text(
        'Config v${insights.configVersion}',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      backgroundColor: Colors.grey[200],
      padding: EdgeInsets.zero,
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _buildAppealRow(BuildContext context) {
    final status = insights.appeal.status;
    final color = _getAppealColor(status);

    return Row(
      children: [
        Icon(_getAppealIcon(status), size: 18, color: color),
        const SizedBox(width: 6),
        Text(
          'Appeal: ${status.displayLabel}',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color),
        ),
        if (insights.appeal.updatedAt != null) ...[
          const SizedBox(width: 8),
          Text(
            '(${_formatDateTime(insights.appeal.updatedAt!)})',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Colors.grey[500]),
          ),
        ],
      ],
    );
  }

  IconData _getAppealIcon(InsightAppealStatus status) {
    switch (status) {
      case InsightAppealStatus.none:
        return Icons.remove_circle_outline;
      case InsightAppealStatus.pending:
        return Icons.hourglass_empty;
      case InsightAppealStatus.approved:
        return Icons.check_circle;
      case InsightAppealStatus.rejected:
        return Icons.cancel;
    }
  }

  Color _getAppealColor(InsightAppealStatus status) {
    switch (status) {
      case InsightAppealStatus.none:
        return Colors.grey;
      case InsightAppealStatus.pending:
        return Colors.orange;
      case InsightAppealStatus.approved:
        return Colors.green;
      case InsightAppealStatus.rejected:
        return Colors.red;
    }
  }

  String _formatDateTime(DateTime dateTime) {
    final formatter = DateFormat.yMd().add_jm();
    return formatter.format(dateTime.toLocal());
  }
}

/// Risk band chip with color coding
class _RiskBandChip extends StatelessWidget {
  final RiskBand riskBand;

  const _RiskBandChip({required this.riskBand});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (color, bgColor) = _getRiskColors(scheme);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.sm,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(context.radius.pill),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        riskBand.displayLabel,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  (Color, Color) _getRiskColors(ColorScheme scheme) {
    switch (riskBand) {
      case RiskBand.low:
        return (scheme.primary, scheme.primary.withValues(alpha: 0.12));
      case RiskBand.medium:
        return (scheme.tertiary, scheme.tertiary.withValues(alpha: 0.12));
      case RiskBand.high:
        return (scheme.error, scheme.error.withValues(alpha: 0.12));
    }
  }
}

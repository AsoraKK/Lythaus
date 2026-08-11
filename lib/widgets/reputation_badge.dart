// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/state/models/reputation.dart';

enum ReputationBadgeSize { small, medium, large }

/// Displays a backend-issued reputation state without deriving it locally.
class ReputationBadge extends StatelessWidget {
  const ReputationBadge({
    super.key,
    required this.state,
    this.size = ReputationBadgeSize.small,
    this.showLabel = false,
  });

  final ReputationState state;
  final ReputationBadgeSize size;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = context.colorScheme;
    final color = _statusColor(scheme, state.reputationStatus);
    final icon = _iconForLevel(state.level);
    final (
      double iconSize,
      TextStyle? textStyle,
      double paddingH,
      double paddingV,
    ) = switch (size) {
      ReputationBadgeSize.small => (
        12.0,
        context.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
        context.spacing.xs,
        context.spacing.xs / 2,
      ),
      ReputationBadgeSize.medium => (
        16.0,
        context.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600),
        context.spacing.sm,
        context.spacing.xs,
      ),
      ReputationBadgeSize.large => (
        20.0,
        context.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        context.spacing.md,
        context.spacing.sm,
      ),
    };
    final label = showLabel ? state.levelName : 'Level ${state.level}';

    return Semantics(
      label:
          'Reputation ${state.levelName}, ${state.reputationBand}, '
          '${state.reputationStatus}',
      child: Tooltip(
        message:
            '${state.levelName} • ${state.reputationBand} '
            '(${state.reputationStatus})',
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: paddingH,
            vertical: paddingV,
          ),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(context.radius.pill),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: iconSize, color: color),
              SizedBox(width: context.spacing.xs),
              Text(label, style: textStyle?.copyWith(color: color)),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _iconForLevel(int level) {
    return switch (level) {
      >= 5 => Icons.workspace_premium,
      4 => Icons.stars,
      3 => Icons.military_tech,
      2 => Icons.verified_outlined,
      1 => Icons.check_circle_outline,
      _ => Icons.emoji_events_outlined,
    };
  }

  static Color _statusColor(ColorScheme scheme, String status) {
    return switch (status.toLowerCase()) {
      'suspended' || 'restricted' || 'actioned' => scheme.error,
      'under_review' || 'review' => scheme.tertiary,
      _ => scheme.primary,
    };
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/state/models/reputation.dart';

/// Size variants for the reputation badge
enum ReputationBadgeSize {
  /// Small badge for inline use (e.g., post headers)
  small,

  /// Medium badge for profile cards
  medium,

  /// Large badge for profile pages
  large,
}

/// A widget that displays a user's reputation score as a badge.
///
/// The badge colour and label reflect the Phase 1 reputation levels:
/// - Level 0 — New (score < 10)
/// - Level 1 — Verified (score 10–49)
/// - Level 2 — Trusted (score 50–199)
/// - Level 3 — Established (score 200–499)
/// - Level 4 — Credible (score 500–999)
/// - Level 5 — Highly Credible (score ≥ 1000)
///
/// Example usage:
/// ```dart
/// ReputationBadge(
///   score: 150,
///   size: ReputationBadgeSize.small,
/// )
/// ```
class ReputationBadge extends StatelessWidget {
  /// The user's reputation score
  final int score;

  /// The size of the badge
  final ReputationBadgeSize size;

  /// Whether to show the full label (e.g., "Rep: 42") or just the number
  final bool showLabel;

  const ReputationBadge({
    super.key,
    required this.score,
    this.size = ReputationBadgeSize.small,
    this.showLabel = false,
  });

  /// Get the level display name based on score
  static String getTierName(int score) {
    return computeLevelFromScore(score).displayName;
  }

  /// Get the icon for the reputation level
  static IconData getTierIcon(int score) {
    final level = computeLevelFromScore(score);
    return switch (level) {
      ReputationLevel.highlyCredible => Icons.workspace_premium,
      ReputationLevel.credible => Icons.stars,
      ReputationLevel.established => Icons.military_tech,
      ReputationLevel.trusted => Icons.verified_outlined,
      ReputationLevel.verified => Icons.check_circle_outline,
      ReputationLevel.newUser => Icons.emoji_events_outlined,
    };
  }

  @override
  Widget build(BuildContext context) {
    final scheme = context.colorScheme;
    final tierColor = _tierColor(scheme, score);
    final backgroundColor = tierColor.withValues(alpha: 0.12);
    final icon = getTierIcon(score);

    // Size-specific dimensions
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

    return Tooltip(
      message: '${getTierName(score)} • $score reputation',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: paddingH, vertical: paddingV),
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(context.radius.pill),
          border: Border.all(color: tierColor.withValues(alpha: 0.3), width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: iconSize, color: tierColor),
            SizedBox(width: context.spacing.xs),
            Text(
              showLabel ? 'Rep: $score' : '$score',
              style: textStyle?.copyWith(color: tierColor),
            ),
          ],
        ),
      ),
    );
  }

  static Color _tierColor(ColorScheme scheme, int score) {
    final level = computeLevelFromScore(score);
    return switch (level) {
      ReputationLevel.highlyCredible => scheme.primary,
      ReputationLevel.credible => scheme.onSurface.withValues(alpha: 0.82),
      ReputationLevel.established => scheme.onSurface.withValues(alpha: 0.70),
      ReputationLevel.trusted => scheme.onSurface.withValues(alpha: 0.64),
      ReputationLevel.verified => scheme.onSurface.withValues(alpha: 0.58),
      ReputationLevel.newUser => scheme.onSurface.withValues(alpha: 0.48),
    };
  }
}

/// Extension to format reputation scores for display
extension ReputationFormatting on int {
  /// Format large reputation scores (e.g., 1500 -> "1.5K")
  String toReputationString() {
    if (this >= 10000) {
      return '${(this / 1000).toStringAsFixed(0)}K';
    }
    if (this >= 1000) {
      return '${(this / 1000).toStringAsFixed(1)}K';
    }
    return toString();
  }
}

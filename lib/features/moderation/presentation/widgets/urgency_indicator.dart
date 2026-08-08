// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// LYTHAUS URGENCY INDICATOR
///
/// 🎯 Purpose: Display urgency score with color-coded indicator
/// 🔍 Single Responsibility: Urgency visualization only
/// 📊 Policy: Shows NUMERIC score to appeal submitters (their own appeals)
///           Community voters see only qualitative labels (Critical/High/Medium/Low)
///           This prevents vote bias while keeping submitters informed

class UrgencyIndicator extends StatelessWidget {
  final int score;

  const UrgencyIndicator({super.key, required this.score});

  @override
  Widget build(BuildContext context) {
    final color = _getUrgencyColor(context, score);
    final label = _getUrgencyLabel(score);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.sm,
        vertical: context.spacing.xs / 2,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(context.radius.pill),
        border: Border.all(color: color),
      ),
      child: Text(
        'Urgency: $label',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Color _getUrgencyColor(BuildContext context, int urgency) {
    final scheme = context.colorScheme;
    if (urgency >= 80) return scheme.error;
    if (urgency >= 60) return scheme.primary;
    if (urgency >= 40) return scheme.tertiary;
    return scheme.onSurface.withValues(alpha: 0.6);
  }

  String _getUrgencyLabel(int urgency) {
    if (urgency >= 80) return 'Critical';
    if (urgency >= 60) return 'High';
    if (urgency >= 40) return 'Medium';
    return 'Low';
  }
}

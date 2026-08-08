// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/ui/theme/spacing.dart';

class TierBadge extends StatelessWidget {
  const TierBadge({super.key, required this.label, this.highlight = false});

  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = highlight
        ? theme.colorScheme.secondary
        : theme.colorScheme.primary.withValues(alpha: 0.14);
    final textColor = highlight
        ? theme.colorScheme.onSecondary
        : theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: Spacing.sm,
        vertical: Spacing.xxxs,
      ),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(
          color: textColor,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

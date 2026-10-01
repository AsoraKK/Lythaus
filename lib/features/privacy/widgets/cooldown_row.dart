// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

/// Displays last export info and next availability countdown.
class PrivacyCooldownRow extends StatelessWidget {
  const PrivacyCooldownRow({
    super.key,
    required this.lastRequestLabel,
    required this.nextAvailableLabel,
  });

  final String lastRequestLabel;
  final String nextAvailableLabel;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final mutedColor = Theme.of(context).colorScheme.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lastRequestLabel,
          style: textTheme.bodySmall?.copyWith(color: mutedColor),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            const Icon(Icons.timer_outlined, size: 16),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                nextAvailableLabel,
                style: textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

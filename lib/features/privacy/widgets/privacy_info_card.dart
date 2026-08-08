// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class PrivacyInfoCard extends StatelessWidget {
  const PrivacyInfoCard({super.key});

  static const _items = [
    (
      icon: Icons.policy_outlined,
      title: 'Privacy policy',
      body: 'Learn how we collect and use data across Lythaus surfaces.',
    ),
    (
      icon: Icons.verified_user_outlined,
      title: 'Data security',
      body:
          'We enforce encryption, device integrity checks, and telemetry monitoring.',
    ),
    (
      icon: Icons.mail_outline,
      title: 'Need help?',
      body: 'Contact privacy@lythaus.co for data-subject questions.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final primary = Theme.of(context).colorScheme.primary;
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline, color: primary),
              SizedBox(width: spacing.md),
              Text(
                'Privacy resources',
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          SizedBox(height: spacing.md),
          for (var i = 0; i < _items.length; i++) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(_items[i].icon, size: 20),
                SizedBox(width: spacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _items[i].title,
                        style: textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: spacing.xs),
                      Text(_items[i].body, style: textTheme.bodyMedium),
                    ],
                  ),
                ),
              ],
            ),
            if (i < _items.length - 1) SizedBox(height: spacing.md),
          ],
        ],
      ),
    );
  }
}

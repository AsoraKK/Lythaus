// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/privacy/widgets/cooldown_row.dart';

/// Card widget for the privacy export flow.
class PrivacyExportSection extends StatelessWidget {
  const PrivacyExportSection({
    super.key,
    required this.isBusy,
    required this.isCoolingDown,
    required this.buttonLabel,
    required this.onRequest,
    required this.cooldownRow,
    required this.onRefresh,
  });

  final bool isBusy;
  final bool isCoolingDown;
  final String buttonLabel;
  final VoidCallback? onRequest;
  final VoidCallback onRefresh;
  final PrivacyCooldownRow cooldownRow;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_person_outlined, color: colorScheme.primary),
              SizedBox(width: spacing.md),
              Text(
                'Export your data',
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          SizedBox(height: spacing.md),
          Text(
            'Request a copy of your account data. Track processing here; a secure download is provided when ready.',
            style: textTheme.bodyMedium,
          ),
          SizedBox(height: spacing.lg),
          SizedBox(
            width: double.infinity,
            child: LythButton(
              label: buttonLabel,
              variant: LythButtonVariant.primary,
              onPressed: onRequest,
              isLoading: isBusy,
              disabled: isCoolingDown,
            ),
          ),
          SizedBox(height: spacing.md),
          cooldownRow,
          Align(
            alignment: Alignment.centerLeft,
            child: LythButton.tertiary(
              label: 'Refresh status',
              onPressed: onRefresh,
              icon: Icons.refresh,
              size: LythButtonSize.small,
            ),
          ),
        ],
      ),
    );
  }
}

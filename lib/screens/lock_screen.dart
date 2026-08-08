// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class FirstPostLockScreen extends ConsumerWidget {
  const FirstPostLockScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const policyLines = [
      'Choose an authorship disclosure before posting.',
      'AI-generated posts are labeled and do not earn reputation.',
      'Disclosure conflicts may enter Under review.',
      'Community appeal votes are advisory; moderators make final decisions.',
      'This is an invite-only Alpha.',
    ];

    return Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(context.spacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.lock_outline,
                size: 64,
                color: Theme.of(context).colorScheme.primary,
              ),
              SizedBox(height: context.spacing.xl),
              Text(
                'Create your first post to unlock reading',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: context.spacing.md),
              Text(
                'New users need to create their first post promptly to continue using Lythaus.',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              SizedBox(height: context.spacing.lg),
              Text(
                'Before you post',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: context.spacing.sm),
              ...policyLines.map(
                (line) => Padding(
                  padding: EdgeInsets.only(bottom: context.spacing.xs),
                  child: Text(
                    line,
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              SizedBox(height: context.spacing.xl),
              LythButton.primary(
                label: 'Create first post',
                onPressed: () => runWithDeviceGuard(
                  context,
                  ref,
                  IntegrityUseCase.postContent,
                  () async {
                    if (!context.mounted) return;
                    Navigator.pushNamed(context, '/compose');
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

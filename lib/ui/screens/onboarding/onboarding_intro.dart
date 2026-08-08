// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/ui/theme/spacing.dart';

class OnboardingIntroScreen extends StatelessWidget {
  const OnboardingIntroScreen({super.key, this.onContinue});

  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    const policyLines = [
      'Choose an authorship disclosure before posting.',
      'AI-generated posts are labeled and do not earn reputation.',
      'Disclosure conflicts may enter Under review.',
      'Community appeal votes are advisory; moderators make final decisions.',
      'This is an invite-only Alpha.',
    ];

    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Spacer(),
            Text(
              'Welcome to Lythaus',
              style: Theme.of(
                context,
              ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: Spacing.sm),
            Text(
              'The authentic social network. Curated feeds, credible voices, '
              'and calm interactions.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: Spacing.lg),
            Text(
              'Before you post',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: Spacing.sm),
            ...policyLines.map(
              (line) => Padding(
                padding: const EdgeInsets.only(bottom: Spacing.xs),
                child: Text(
                  line,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ),
            const Spacer(),
            FilledButton(
              onPressed: onContinue ?? () => Navigator.of(context).maybePop(),
              child: const Text('Continue'),
            ),
            const SizedBox(height: Spacing.md),
          ],
        ),
      ),
    );
  }
}

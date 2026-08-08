// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/ui/components/filter_modal.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class OnboardingCustomFeedPrompt extends StatelessWidget {
  const OnboardingCustomFeedPrompt({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Custom feed')),
      body: Padding(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Craft your home feed',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: Spacing.sm),
            Text(
              'Layer content types, sorting, and refinements. Save one free feed '
              'or unlock more with higher tiers.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: Spacing.lg),
            const Expanded(child: SingleChildScrollView(child: FilterModal())),
          ],
        ),
      ),
    );
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/components/appeal_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class AppealCaseScreen extends ConsumerWidget {
  const AppealCaseScreen({super.key, this.appealId});

  final String? appealId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appeals = ref.watch(appealsProvider);
    final appeal = appeals.firstWhere(
      (a) => a.id == appealId,
      orElse: () => appeals.first,
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Appeal')),
      body: ListView(
        padding: const EdgeInsets.only(top: Spacing.sm, bottom: Spacing.lg),
        children: [
          AppealCard(appeal: appeal, onVoteFor: () {}, onVoteAgainst: () {}),
          Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Evidence',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: Spacing.xs),
                Text(
                  'Voting UI is scaffolded; backend weighting will plug in later.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/components/moderation_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class ModerationCaseScreen extends ConsumerWidget {
  const ModerationCaseScreen({super.key, this.caseId});

  final String? caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(moderationQueueProvider);
    final caseItem = queue.firstWhere(
      (c) => c.id == caseId,
      orElse: () => queue.first,
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Moderation Case')),
      body: ListView(
        padding: const EdgeInsets.only(top: Spacing.sm, bottom: Spacing.lg),
        children: [
          ModerationCard(caseItem: caseItem, onApprove: () {}, onReject: () {}),
          Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Context',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: Spacing.xs),
                Text(
                  caseItem.anonymizedContent,
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

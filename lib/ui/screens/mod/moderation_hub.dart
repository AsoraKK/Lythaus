// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/components/appeal_card.dart';
import 'package:lythaus/ui/components/moderation_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class ModerationHubScreen extends ConsumerWidget {
  const ModerationHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(moderationQueueProvider);
    final appeals = ref.watch(appealsProvider);
    final stats = ref.watch(moderationStatsProvider);

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Moderation Hub'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Review Queue'),
              Tab(text: 'Appeals'),
              Tab(text: 'History'),
              Tab(text: 'Stats'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ListView.separated(
              padding: EdgeInsets.only(
                top: context.spacing.sm,
                bottom: context.spacing.xl,
              ),
              itemBuilder: (_, index) => ModerationCard(
                caseItem: queue[index],
                onApprove: () {},
                onReject: () {},
              ),
              separatorBuilder: (_, __) => SizedBox(height: context.spacing.xs),
              itemCount: queue.length,
            ),
            ListView.separated(
              padding: EdgeInsets.only(
                top: context.spacing.sm,
                bottom: context.spacing.xl,
              ),
              itemBuilder: (_, index) => AppealCard(
                appeal: appeals[index],
                onVoteFor: () {},
                onVoteAgainst: () {},
              ),
              separatorBuilder: (_, __) => SizedBox(height: context.spacing.xs),
              itemCount: appeals.length,
            ),
            const _HistoryStub(),
            Padding(
              padding: EdgeInsets.all(context.spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Stats',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: context.spacing.md),
                  _statTile(context, 'Queue', stats.queueSize.toString()),
                  _statTile(
                    context,
                    'Appeals open',
                    stats.appealOpen.toString(),
                  ),
                  _statTile(
                    context,
                    'Decisions today',
                    stats.decisionsToday.toString(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statTile(BuildContext context, String title, String value) {
    return Padding(
      padding: EdgeInsets.only(bottom: context.spacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _HistoryStub extends StatelessWidget {
  const _HistoryStub();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(context.spacing.lg),
        child: Column(
          children: [
            Icon(
              Icons.history,
              size: 48,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
            SizedBox(height: context.spacing.md),
            Text(
              'No moderation history yet',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            SizedBox(height: context.spacing.xs),
            Text(
              'Completed reviews will appear here.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

/// Shows only the private, server-recorded reputation and activity history.
class ReputationLedgerScreen extends StatelessWidget {
  const ReputationLedgerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reputation activity'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Reputation'),
              Tab(text: 'Account activity'),
            ],
          ),
        ),
        body: const Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'These records come from Lythaus and cannot be edited here. '
                'Appeals begin from an eligible resolved moderation case.',
              ),
            ),
            Expanded(
              child: TabBarView(children: [_LedgerPage(), _ActivityPage()]),
            ),
          ],
        ),
      ),
    );
  }
}

class _LedgerPage extends ConsumerStatefulWidget {
  const _LedgerPage();

  @override
  ConsumerState<_LedgerPage> createState() => _LedgerPageState();
}

class _LedgerPageState extends ConsumerState<_LedgerPage> {
  String? _cursor;

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(reputationLedgerPageProvider(_cursor));
    return page.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => _RetryState(
        message: 'Could not load reputation history.',
        onRetry: () => ref.invalidate(reputationLedgerPageProvider(_cursor)),
      ),
      data: (value) {
        if (value.items.isEmpty) {
          return const _EmptyActivityState(
            message: 'No reputation entries yet.',
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(reputationLedgerPageProvider(_cursor));
            await ref.read(reputationLedgerPageProvider(_cursor).future);
          },
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
            itemCount: value.items.length + (value.hasMore ? 1 : 0),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              if (index == value.items.length) {
                return Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _cursor = value.nextCursor),
                    icon: const Icon(Icons.navigate_next),
                    label: const Text('Next page'),
                  ),
                );
              }
              return _LedgerEntryTile(entry: value.items[index]);
            },
          ),
        );
      },
    );
  }
}

class _ActivityPage extends ConsumerStatefulWidget {
  const _ActivityPage();

  @override
  ConsumerState<_ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends ConsumerState<_ActivityPage> {
  String? _cursor;

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(activityPageProvider(_cursor));
    return page.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => _RetryState(
        message: 'Could not load account activity.',
        onRetry: () => ref.invalidate(activityPageProvider(_cursor)),
      ),
      data: (value) {
        if (value.items.isEmpty) {
          return const _EmptyActivityState(message: 'No account activity yet.');
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(activityPageProvider(_cursor));
            await ref.read(activityPageProvider(_cursor).future);
          },
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
            itemCount: value.items.length + (value.hasMore ? 1 : 0),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              if (index == value.items.length) {
                return Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _cursor = value.nextCursor),
                    icon: const Icon(Icons.navigate_next),
                    label: const Text('Next page'),
                  ),
                );
              }
              return _ActivityEntryTile(entry: value.items[index]);
            },
          ),
        );
      },
    );
  }
}

class _RetryState extends StatelessWidget {
  const _RetryState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(
        liveRegion: true,
        label: message,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message),
            const SizedBox(height: Spacing.sm),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyActivityState extends StatelessWidget {
  const _EmptyActivityState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(liveRegion: true, label: message, child: Text(message)),
    );
  }
}

class _LedgerEntryTile extends StatelessWidget {
  const _LedgerEntryTile({required this.entry});

  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label:
          '${entry.eventType}, ${entry.impact} impact, ${entry.status}, '
          'policy ${entry.policyVersion}',
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: scheme.primary.withValues(alpha: 0.12),
          child: Icon(Icons.insights_outlined, color: scheme.primary),
        ),
        title: Text(entry.eventType),
        subtitle: Text(
          '${entry.explanationCode} • ${entry.pillar}\n'
          'Policy ${entry.policyVersion} • ${_formatDate(entry.createdAt)}',
        ),
        isThreeLine: true,
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(entry.impact),
            if (entry.appealId != null)
              const Icon(Icons.gavel_outlined, size: 16),
          ],
        ),
      ),
    );
  }
}

class _ActivityEntryTile extends StatelessWidget {
  const _ActivityEntryTile({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    final suffix = entry.appealable
        ? ' Appeal availability is recorded by the moderation case.'
        : '';
    return Semantics(
      label: '${entry.title}, ${entry.result}, policy ${entry.policyVersion}',
      child: ListTile(
        leading: const Icon(Icons.history_outlined),
        title: Text(entry.title),
        subtitle: Text(
          '${entry.explanation}\n'
          '${entry.result} • ${entry.reasonCode} • '
          'Policy ${entry.policyVersion}$suffix',
        ),
        isThreeLine: true,
        trailing: Text(_formatDate(entry.createdAt)),
      ),
    );
  }
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

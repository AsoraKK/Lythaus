// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

/// Private, server-recorded reputation and account-activity history.
class ReputationLedgerScreen extends StatelessWidget {
  const ReputationLedgerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Activity & Audit Log'),
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
                'These private records are issued by Lythaus and cannot be '
                'edited here. Appeals begin from an eligible resolved '
                'moderation case.',
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [_ReputationDashboard(), _ActivityPage()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReputationDashboard extends ConsumerWidget {
  const _ReputationDashboard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reputation = ref.watch(reputationProvider);
    return reputation.when(
      loading: () => Center(
        child: Semantics(
          liveRegion: true,
          label: 'Loading private reputation dashboard',
          child: const CircularProgressIndicator(),
        ),
      ),
      error: (_, __) => _RetryState(
        message: 'Could not load reputation status.',
        onRetry: () => ref.invalidate(reputationProvider),
      ),
      data: (state) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(reputationProvider);
          await ref.read(reputationProvider.future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Spacing.md),
          children: [
            Semantics(
              container: true,
              label: 'Private reputation dashboard. Server-issued values only.',
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(Spacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Private reputation',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: Spacing.sm),
                      _DashboardValue(
                        label: 'Level',
                        value: 'Level ${state.level}: ${state.levelName}',
                      ),
                      _DashboardValue(
                        label: 'Band',
                        value: state.reputationBand,
                      ),
                      _DashboardValue(
                        label: 'Status',
                        value: state.reputationStatus,
                      ),
                      _DashboardValue(
                        label: 'Policy version',
                        value: state.policyVersion,
                      ),
                      if (state.evaluatedAt != null)
                        _DashboardValue(
                          label: 'Last evaluated',
                          value: _formatDateTime(state.evaluatedAt!),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: Spacing.md),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Private reputation pillars',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: Spacing.sm),
                    if (state.pillars.isEmpty)
                      const Text(
                        'No private reputation pillar values have been issued yet.',
                      )
                    else
                      for (final pillar in state.pillars.entries)
                        _DashboardValue(
                          label: _humanizeIdentifier(pillar.key),
                          value: pillar.value.toString(),
                        ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: Spacing.md),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Promotion blockers',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: Spacing.sm),
                    if (state.promotionBlockers.isEmpty)
                      Semantics(
                        liveRegion: true,
                        label: 'No promotion blockers are currently recorded.',
                        child: const Text(
                          'No promotion blockers are currently recorded.',
                        ),
                      )
                    else
                      for (final blocker in state.promotionBlockers)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Spacing.xs),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 2),
                                child: Icon(Icons.info_outline, size: 18),
                              ),
                              const SizedBox(width: Spacing.sm),
                              Expanded(child: Text(blocker)),
                            ],
                          ),
                        ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityPage extends ConsumerStatefulWidget {
  const _ActivityPage();

  @override
  ConsumerState<_ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends ConsumerState<_ActivityPage> {
  ActivityCategory _category = ActivityCategory.all;
  final List<ActivityEntry> _entries = <ActivityEntry>[];
  String? _nextCursor;
  String? _failedCursor;
  Object? _error;
  bool _isLoading = false;
  int _requestVersion = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resetAndLoad());
  }

  Future<void> _resetAndLoad() async {
    final requestVersion = ++_requestVersion;
    if (mounted) {
      setState(() {
        _entries.clear();
        _nextCursor = null;
        _failedCursor = null;
        _error = null;
        _isLoading = true;
      });
    }
    await _fetchPage(
      cursor: null,
      requestVersion: requestVersion,
      replace: true,
    );
  }

  Future<void> _loadNextPage() async {
    final cursor = _nextCursor;
    if (cursor == null || cursor.isEmpty || _isLoading) {
      return;
    }
    final requestVersion = _requestVersion;
    setState(() {
      _failedCursor = null;
      _error = null;
      _isLoading = true;
    });
    await _fetchPage(
      cursor: cursor,
      requestVersion: requestVersion,
      replace: false,
    );
  }

  Future<void> _fetchPage({
    required String? cursor,
    required int requestVersion,
    required bool replace,
  }) async {
    final query = ActivityPageQuery(cursor: cursor, category: _category);
    try {
      final page = await ref.read(activityPageProvider(query).future);
      if (!mounted || requestVersion != _requestVersion) {
        return;
      }
      setState(() {
        if (replace) {
          _entries
            ..clear()
            ..addAll(page.items);
        } else {
          final knownIds = _entries.map((entry) => entry.id).toSet();
          _entries.addAll(
            page.items.where(
              (entry) => entry.id.isEmpty || !knownIds.contains(entry.id),
            ),
          );
        }
        _nextCursor = page.nextCursor;
        _failedCursor = null;
        _error = null;
      });
    } catch (error) {
      if (!mounted || requestVersion != _requestVersion) {
        return;
      }
      setState(() {
        _error = error;
        _failedCursor = cursor;
      });
    } finally {
      if (mounted && requestVersion == _requestVersion) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _selectCategory(ActivityCategory category) {
    if (_category == category) {
      return;
    }
    setState(() => _category = category);
    _resetAndLoad();
  }

  Future<void> _retry() async {
    final cursor = _failedCursor;
    ref.invalidate(
      activityPageProvider(
        ActivityPageQuery(cursor: cursor, category: _category),
      ),
    );
    if (cursor == null) {
      await _resetAndLoad();
    } else {
      await _loadNextPage();
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(
      activityPageProvider(ActivityPageQuery(category: _category)),
    );
    await _resetAndLoad();
  }

  @override
  Widget build(BuildContext context) {
    final initialLoading = _isLoading && _entries.isEmpty && _error == null;
    return Column(
      children: [
        _ActivityCategoryFilters(
          selected: _category,
          onSelected: _selectCategory,
        ),
        Expanded(
          child: initialLoading
              ? Center(
                  child: Semantics(
                    liveRegion: true,
                    label: 'Loading private account activity',
                    child: const CircularProgressIndicator(),
                  ),
                )
              : _error != null && _entries.isEmpty
              ? _RetryState(
                  message: 'Could not load account activity.',
                  onRetry: _retry,
                )
              : RefreshIndicator(
                  onRefresh: _refresh,
                  child: _ActivityList(
                    entries: _entries,
                    category: _category,
                    nextCursor: _nextCursor,
                    isLoadingNext: _isLoading,
                    loadError: _error,
                    onLoadNext: _loadNextPage,
                    onRetry: _retry,
                  ),
                ),
        ),
      ],
    );
  }
}

class _ActivityCategoryFilters extends StatelessWidget {
  const _ActivityCategoryFilters({
    required this.selected,
    required this.onSelected,
  });

  final ActivityCategory selected;
  final ValueChanged<ActivityCategory> onSelected;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Filter private account activity by category',
      child: SizedBox(
        height: 56,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(
            horizontal: Spacing.md,
            vertical: Spacing.xs,
          ),
          itemCount: ActivityCategory.values.length,
          separatorBuilder: (_, __) => const SizedBox(width: Spacing.xs),
          itemBuilder: (context, index) {
            final category = ActivityCategory.values[index];
            return Semantics(
              button: true,
              selected: selected == category,
              label: 'Show ${category.label} activity',
              child: FilterChip(
                label: Text(category.label),
                selected: selected == category,
                onSelected: (_) => onSelected(category),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ActivityList extends StatelessWidget {
  const _ActivityList({
    required this.entries,
    required this.category,
    required this.nextCursor,
    required this.isLoadingNext,
    required this.loadError,
    required this.onLoadNext,
    required this.onRetry,
  });

  final List<ActivityEntry> entries;
  final ActivityCategory category;
  final String? nextCursor;
  final bool isLoadingNext;
  final Object? loadError;
  final VoidCallback onLoadNext;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 280,
            child: _EmptyActivityState(
              message: category == ActivityCategory.all
                  ? 'No account activity yet.'
                  : 'No ${category.label.toLowerCase()} activity yet.',
            ),
          ),
        ],
      );
    }

    final showLoadMore = nextCursor != null && nextCursor!.isNotEmpty;
    final showRetry = loadError != null;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
      itemCount: entries.length + 1,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        if (index < entries.length) {
          return _ActivityEntryTile(entry: entries[index]);
        }
        if (isLoadingNext) {
          return Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Center(
              child: Semantics(
                liveRegion: true,
                label: 'Loading older account activity',
                child: const CircularProgressIndicator(),
              ),
            ),
          );
        }
        if (showRetry) {
          return Center(
            child: TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry loading more'),
            ),
          );
        }
        if (showLoadMore) {
          return Center(
            child: TextButton.icon(
              onPressed: onLoadNext,
              icon: const Icon(Icons.navigate_next),
              label: const Text('Load older activity'),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Semantics(
            liveRegion: true,
            label: 'End of account activity',
            child: const Center(child: Text('End of activity')),
          ),
        );
      },
    );
  }
}

class _DashboardValue extends StatelessWidget {
  const _DashboardValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
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

class _ActivityEntryTile extends StatelessWidget {
  const _ActivityEntryTile({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label:
          '${entry.title}, ${entry.result}, ${_formatDate(entry.createdAt)}. '
          'Open details.',
      child: ListTile(
        leading: const Icon(Icons.history_outlined),
        title: Text(entry.title),
        subtitle: Text(
          '${entry.result} • ${_activityCategoryLabel(entry.category)}\n'
          'Policy ${entry.policyVersion}',
        ),
        isThreeLine: true,
        trailing: Text(_formatDate(entry.createdAt)),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (_) => _ActivityDetailSheet(entry: entry),
        ),
      ),
    );
  }
}

class _ActivityDetailSheet extends StatelessWidget {
  const _ActivityDetailSheet({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    final policyLink = _policyLinkFor(entry);
    return SafeArea(
      top: false,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Align(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: Spacing.md),
            Text(entry.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Spacing.md),
            _DetailValue(
              label: 'Timestamp',
              value: _formatDateTime(entry.createdAt),
            ),
            _DetailValue(
              label: 'Category',
              value: _activityCategoryLabel(entry.category),
            ),
            _DetailValue(
              label: 'Source',
              value: _humanizeIdentifier(entry.source),
            ),
            _DetailValue(label: 'Explanation', value: entry.explanation),
            _DetailValue(label: 'Result', value: entry.result),
            _DetailValue(
              label: 'Object',
              value: entry.objectType == null
                  ? 'Account activity'
                  : _humanizeIdentifier(entry.objectType!),
            ),
            _DetailValue(
              label: 'Reputation effect',
              value: entry.reputationEffect,
            ),
            _DetailValue(
              label: 'Appealability',
              value: entry.appealable
                  ? 'This record is eligible for appeal through its moderation case.'
                  : 'This record is not appealable.',
            ),
            _DetailValue(
              label: 'Retention',
              value: _retentionDescription(entry),
            ),
            _DetailValue(label: 'Policy version', value: entry.policyVersion),
            if (policyLink != null) ...[
              const SizedBox(height: Spacing.sm),
              Semantics(
                link: true,
                label: 'Open ${policyLink.label}',
                child: TextButton.icon(
                  onPressed: () => _launchLythausPolicy(policyLink.uri),
                  icon: const Icon(Icons.open_in_new),
                  label: Text(policyLink.label),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailValue extends StatelessWidget {
  const _DetailValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: Spacing.xs),
          Text(value),
        ],
      ),
    );
  }
}

class _ActivityPolicyLink {
  const _ActivityPolicyLink({required this.label, required this.uri});

  final String label;
  final Uri uri;
}

_ActivityPolicyLink? _policyLinkFor(ActivityEntry entry) {
  switch (ActivityCategory.fromValue(entry.category)) {
    case ActivityCategory.moderation:
    case ActivityCategory.appeals:
      return _ActivityPolicyLink(
        label: 'Lythaus Community Guidelines',
        uri: Uri.parse('https://lythaus.co/guidelines'),
      );
    case ActivityCategory.privacy:
      return _ActivityPolicyLink(
        label: 'Lythaus Privacy Policy',
        uri: Uri.parse('https://lythaus.co/privacy'),
      );
    case ActivityCategory.rewards:
      return _ActivityPolicyLink(
        label: 'Lythaus Terms of Service',
        uri: Uri.parse('https://lythaus.co/terms'),
      );
    case ActivityCategory.all:
    case ActivityCategory.account:
    case ActivityCategory.content:
    case ActivityCategory.social:
    case ActivityCategory.reputation:
    case null:
      return null;
  }
}

Future<void> _launchLythausPolicy(Uri uri) async {
  if (uri.scheme != 'https' || uri.host != 'lythaus.co') {
    return;
  }
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

String _retentionDescription(ActivityEntry entry) {
  final days = entry.retentionDays;
  final retentionClass = ' (${_humanizeIdentifier(entry.retentionClass)})';
  return '$days day${days == 1 ? '' : 's'}$retentionClass';
}

String _activityCategoryLabel(String value) =>
    ActivityCategory.fromValue(value)?.label ?? _humanizeIdentifier(value);

String _humanizeIdentifier(String value) {
  final words = value
      .replaceAllMapped(
        RegExp(r'([a-z0-9])([A-Z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .replaceAll(RegExp(r'[_-]+'), ' ')
      .trim();
  if (words.isEmpty) {
    return 'Not available';
  }
  return '${words[0].toUpperCase()}${words.substring(1)}';
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

String _formatDateTime(DateTime value) {
  final local = value.toLocal();
  return '${_formatDate(local)} '
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

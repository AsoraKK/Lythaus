// ignore_for_file: public_member_api_docs, deprecated_member_use

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/presentation/widgets/moderator_guard.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_audit_tab.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_queue_tab.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';

class ModerationConsoleScreen extends ConsumerStatefulWidget {
  const ModerationConsoleScreen({super.key});

  static const List<Tab> _tabs = [
    Tab(icon: Icon(Icons.view_list), text: 'Queue'),
    Tab(icon: Icon(Icons.insights), text: 'Audit'),
    Tab(icon: Icon(Icons.flash_on_outlined), text: 'Insights'),
  ];

  @override
  ConsumerState<ModerationConsoleScreen> createState() =>
      _ModerationConsoleScreenState();
}

class _ModerationConsoleScreenState
    extends ConsumerState<ModerationConsoleScreen> {
  late final AnalyticsClient _analyticsClient;
  bool _hasLoggedView = false;

  @override
  void initState() {
    super.initState();
    _analyticsClient = ref.read(analyticsClientProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) => _logView());
  }

  void _logView() {
    if (_hasLoggedView) return;
    _analyticsClient.logEvent(
      AnalyticsEvents.screenView,
      properties: {
        AnalyticsEvents.propScreenName: 'moderation_console',
        AnalyticsEvents.propReferrer: 'feed',
      },
    );
    _analyticsClient.logEvent(AnalyticsEvents.moderationConsoleOpened);
    _hasLoggedView = true;
  }

  @override
  Widget build(BuildContext context) {
    return ModeratorGuard(
      title: 'Moderation',
      child: DefaultTabController(
        length: ModerationConsoleScreen._tabs.length,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Moderation Console'),
            centerTitle: false,
            bottom: const TabBar(tabs: ModerationConsoleScreen._tabs),
          ),
          body: const TabBarView(
            children: [
              ModerationQueueTab(),
              ModerationAuditTab(),
              _InsightsTab(),
            ],
          ),
        ),
      ),
    );
  }
}

class _InsightsTab extends ConsumerStatefulWidget {
  const _InsightsTab();

  @override
  ConsumerState<_InsightsTab> createState() => _InsightsTabState();
}

class _InsightsTabState extends ConsumerState<_InsightsTab> {
  static const _rangeOptions = <int>[7, 30, 90];
  int _rangeDays = 7;
  String _categoryFilter = 'all';
  String _tierFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final queueState = ref.watch(moderationQueueProvider);
    final auditState = ref.watch(moderationAuditProvider);
    final now = DateTime.now();
    final cutoff = now.subtract(Duration(days: _rangeDays));

    final categories = _buildCategoryOptions(queueState.items);
    final tiers = _buildTierOptions(queueState.items);
    final selectedCategory = categories.contains(_categoryFilter)
        ? _categoryFilter
        : 'all';
    final selectedTier = tiers.contains(_tierFilter) ? _tierFilter : 'all';

    final filteredQueue = queueState.items.where((item) {
      if (item.createdAt.isBefore(cutoff)) {
        return false;
      }
      if (selectedCategory != 'all' &&
          _itemCategory(item).toLowerCase() != selectedCategory) {
        return false;
      }
      if (selectedTier != 'all' &&
          _itemTier(item).toLowerCase() != selectedTier) {
        return false;
      }
      return true;
    }).toList();

    final filteredAudit = auditState.entries
        .where((entry) => !entry.timestamp.isBefore(cutoff))
        .toList();
    final decisionEntries = filteredAudit
        .where((entry) => entry.action == ModerationAuditActionType.decision)
        .toList();
    final upheldCount = decisionEntries.where(_isUpheldDecision).length;
    final overturnedCount = decisionEntries.where(_isOverturnedDecision).length;

    final flagsCount = filteredQueue
        .where((item) => item.type == ModerationItemType.flag)
        .length;
    final appealsCount = filteredQueue
        .where((item) => item.type == ModerationItemType.appeal)
        .length;

    final latencyHours = filteredQueue.isEmpty
        ? 0.0
        : filteredQueue
                  .map((item) => now.difference(item.createdAt).inMinutes)
                  .reduce((a, b) => a + b) /
              filteredQueue.length /
              60.0;
    final trend = _buildTrendRows(filteredQueue, now, _rangeDays);

    final isLoading =
        queueState.isLoading ||
        queueState.isRefreshing ||
        (auditState.isLoading && auditState.entries.isEmpty);
    final hasNoData = filteredQueue.isEmpty && filteredAudit.isEmpty;

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(moderationQueueProvider.notifier).refresh();
        await ref
            .read(moderationAuditProvider.notifier)
            .search(ref.read(moderationAuditProvider).filters);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Operational insights',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Track moderation load, decision outcomes, and queue pressure.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.74),
            ),
          ),
          const SizedBox(height: 16),
          _buildFilters(
            context,
            rangeOptions: _rangeOptions,
            categories: categories,
            tiers: tiers,
            selectedCategory: selectedCategory,
            selectedTier: selectedTier,
          ),
          const SizedBox(height: 16),
          if (isLoading && hasNoData)
            const Center(child: CircularProgressIndicator())
          else ...[
            _InsightsMetricGrid(
              cards: [
                _MetricCardData(
                  label: 'Queue size',
                  value: '${filteredQueue.length}',
                  hint: 'Open items in selected window',
                  icon: Icons.inventory_2_outlined,
                ),
                _MetricCardData(
                  label: 'Flags',
                  value: '$flagsCount',
                  hint: 'Flag cases',
                  icon: Icons.flag_outlined,
                ),
                _MetricCardData(
                  label: 'Appeals',
                  value: '$appealsCount',
                  hint: 'Appeal cases',
                  icon: Icons.gavel_outlined,
                ),
                _MetricCardData(
                  label: 'Avg latency',
                  value: '${latencyHours.toStringAsFixed(1)}h',
                  hint: 'Age from created to now',
                  icon: Icons.hourglass_bottom_outlined,
                ),
                _MetricCardData(
                  label: 'Upheld',
                  value: '$upheldCount',
                  hint: 'Decision outcomes',
                  icon: Icons.check_circle_outline,
                ),
                _MetricCardData(
                  label: 'Overturned',
                  value: '$overturnedCount',
                  hint: 'Decision outcomes',
                  icon: Icons.change_circle_outlined,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _TrendCard(rows: trend),
            if (hasNoData) ...[
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'No items match the selected filters yet.',
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildFilters(
    BuildContext context, {
    required List<int> rangeOptions,
    required List<String> categories,
    required List<String> tiers,
    required String selectedCategory,
    required String selectedTier,
  }) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Filters',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    value: _rangeDays,
                    decoration: const InputDecoration(
                      labelText: 'Date range',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: rangeOptions
                        .map(
                          (days) => DropdownMenuItem<int>(
                            value: days,
                            child: Text('Last $days days'),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _rangeDays = value);
                      }
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: selectedCategory,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: categories
                        .map(
                          (category) => DropdownMenuItem<String>(
                            value: category,
                            child: Text(_label(category)),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _categoryFilter = value);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: selectedTier,
                    decoration: const InputDecoration(
                      labelText: 'Tier',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: tiers
                        .map(
                          (tier) => DropdownMenuItem<String>(
                            value: tier,
                            child: Text(_label(tier)),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _tierFilter = value);
                      }
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<String> _buildCategoryOptions(List<ModerationQueueItem> items) {
    final values = <String>{
      'all',
      ...items.map((item) => _itemCategory(item).toLowerCase()),
    };
    final ordered = values.toList()..sort();
    ordered.remove('all');
    return ['all', ...ordered];
  }

  List<String> _buildTierOptions(List<ModerationQueueItem> items) {
    final values = <String>{
      'all',
      ...items.map((item) => _itemTier(item).toLowerCase()),
    };
    final ordered = values.toList()..sort();
    ordered.remove('all');
    return ['all', ...ordered];
  }

  String _itemCategory(ModerationQueueItem item) {
    return (item.aiSignal ?? item.aiRiskBand ?? item.contentType).trim().isEmpty
        ? 'unknown'
        : (item.aiSignal ?? item.aiRiskBand ?? item.contentType).trim();
  }

  String _itemTier(ModerationQueueItem item) {
    final value = item.tier?.trim().toLowerCase();
    if (value == null || value.isEmpty) {
      return 'unknown';
    }
    return value;
  }

  bool _isUpheldDecision(ModerationAuditEntry entry) {
    final detail = entry.details.toLowerCase();
    return detail.contains('uphold') ||
        detail.contains('reject') ||
        detail.contains('blocked');
  }

  bool _isOverturnedDecision(ModerationAuditEntry entry) {
    final detail = entry.details.toLowerCase();
    return detail.contains('overturn') ||
        detail.contains('approve') ||
        detail.contains('restored');
  }

  List<_DailyTrend> _buildTrendRows(
    List<ModerationQueueItem> queue,
    DateTime now,
    int rangeDays,
  ) {
    final days = rangeDays < 14 ? rangeDays : 14;
    final byDay = <String, _DailyTrend>{};
    for (var i = days - 1; i >= 0; i--) {
      final day = DateTime(
        now.year,
        now.month,
        now.day,
      ).subtract(Duration(days: i));
      final key = _dayKey(day);
      byDay[key] = _DailyTrend(day: day, flags: 0, appeals: 0);
    }

    for (final item in queue) {
      final day = DateTime(
        item.createdAt.year,
        item.createdAt.month,
        item.createdAt.day,
      );
      final key = _dayKey(day);
      final current = byDay[key];
      if (current == null) {
        continue;
      }
      byDay[key] = _DailyTrend(
        day: current.day,
        flags: current.flags + (item.type == ModerationItemType.flag ? 1 : 0),
        appeals:
            current.appeals + (item.type == ModerationItemType.appeal ? 1 : 0),
      );
    }

    return byDay.values.toList();
  }

  String _dayKey(DateTime value) {
    return '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  }

  String _label(String value) {
    if (value == 'all') {
      return 'All';
    }
    if (value.isEmpty) {
      return 'Unknown';
    }
    return value[0].toUpperCase() + value.substring(1);
  }
}

class _InsightsMetricGrid extends StatelessWidget {
  const _InsightsMetricGrid({required this.cards});

  final List<_MetricCardData> cards;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 760 ? 3 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cards.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            childAspectRatio: 1.8,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
          ),
          itemBuilder: (context, index) => _MetricCard(data: cards[index]),
        );
      },
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.data});

  final _MetricCardData data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(data.icon, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  data.label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            data.value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            data.hint,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrendCard extends StatelessWidget {
  const _TrendCard({required this.rows});

  final List<_DailyTrend> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Trends',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            if (rows.isEmpty)
              const Text('No trend data yet.')
            else
              ...rows.map(
                (row) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(width: 92, child: Text(_formatDate(row.day))),
                      Expanded(
                        child: Text(
                          'Flags ${row.flags} • Appeals ${row.appeals}',
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

  String _formatDate(DateTime value) {
    return '${value.month.toString().padLeft(2, '0')}/${value.day.toString().padLeft(2, '0')}';
  }
}

class _MetricCardData {
  const _MetricCardData({
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
  });

  final String label;
  final String value;
  final String hint;
  final IconData icon;
}

class _DailyTrend {
  const _DailyTrend({
    required this.day,
    required this.flags,
    required this.appeals,
  });

  final DateTime day;
  final int flags;
  final int appeals;
}

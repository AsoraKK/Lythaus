// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_case_screen.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_queue_item_tile.dart';

class ModerationQueueTab extends ConsumerStatefulWidget {
  const ModerationQueueTab({super.key});

  @override
  ConsumerState<ModerationQueueTab> createState() => _ModerationQueueTabState();
}

class _ModerationQueueTabState extends ConsumerState<ModerationQueueTab> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 120) {
      ref.read(moderationQueueProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(moderationQueueProvider);
    final notifier = ref.read(moderationQueueProvider.notifier);

    return RefreshIndicator(
      onRefresh: notifier.refresh,
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildFilterGroup<ModerationItemFilter>(
                    context: context,
                    label: 'Item Type',
                    values: ModerationItemFilter.values,
                    selected: state.filters.itemType,
                    onSelected: (value) {
                      notifier.updateFilters(
                        state.filters.copyWith(itemType: value),
                      );
                    },
                    labelBuilder: (value) => _formatItemType(value),
                  ),
                  const SizedBox(height: 8),
                  _buildFilterGroup<ModerationSeverityFilter>(
                    context: context,
                    label: 'Severity',
                    values: ModerationSeverityFilter.values,
                    selected: state.filters.severity,
                    onSelected: (value) {
                      notifier.updateFilters(
                        state.filters.copyWith(severity: value),
                      );
                    },
                    labelBuilder: (value) => _formatSeverity(value),
                  ),
                  const SizedBox(height: 8),
                  _buildFilterGroup<ModerationAgeFilter>(
                    context: context,
                    label: 'Age',
                    values: ModerationAgeFilter.values,
                    selected: state.filters.age,
                    onSelected: (value) {
                      notifier.updateFilters(
                        state.filters.copyWith(age: value),
                      );
                    },
                    labelBuilder: (value) => _formatAge(value),
                  ),
                  const SizedBox(height: 8),
                  _buildFilterGroup<ModerationQueueFilter>(
                    context: context,
                    label: 'Queue',
                    values: ModerationQueueFilter.values,
                    selected: state.filters.queue,
                    onSelected: (value) {
                      notifier.updateFilters(
                        state.filters.copyWith(queue: value),
                      );
                    },
                    labelBuilder: (value) => _formatQueue(value),
                  ),
                ],
              ),
            ),
          ),
          if (state.isLoading && state.items.isEmpty)
            const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            )
          else if (state.errorMessage != null && state.items.isEmpty)
            SliverFillRemaining(
              child: _ErrorMessage(
                message: state.errorMessage!,
                onRetry: notifier.refresh,
              ),
            )
          else if (state.items.isEmpty)
            const SliverFillRemaining(
              child: Center(child: Text('No items in the moderation queue.')),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate((context, index) {
                final item = state.items[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: ModerationQueueItemTile(
                    item: item,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ModerationCaseScreen(caseId: item.id),
                      ),
                    ),
                  ),
                );
              }, childCount: state.items.length),
            ),
          if (state.isLoadingMore)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFilterGroup<T>({
    required BuildContext context,
    required String label,
    required Iterable<T> values,
    required T selected,
    required ValueChanged<T> onSelected,
    required String Function(T) labelBuilder,
  }) {
    final chipTheme = Theme.of(context).chipTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: values.map((value) {
            final selectedValue = value == selected;
            return ChoiceChip(
              label: Text(labelBuilder(value)),
              selected: selectedValue,
              onSelected: (_) => onSelected(value),
              selectedColor: Theme.of(context).colorScheme.primary,
              labelStyle: chipTheme.labelStyle?.copyWith(
                color: selectedValue ? Colors.white : null,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  String _formatItemType(ModerationItemFilter value) {
    return switch (value) {
      ModerationItemFilter.flag => 'Flags',
      ModerationItemFilter.appeal => 'Appeals',
      ModerationItemFilter.all => 'All',
    };
  }

  String _formatSeverity(ModerationSeverityFilter value) {
    return switch (value) {
      ModerationSeverityFilter.high => 'High',
      ModerationSeverityFilter.medium => 'Medium',
      ModerationSeverityFilter.low => 'Low',
      ModerationSeverityFilter.all => 'All',
    };
  }

  String _formatAge(ModerationAgeFilter value) {
    return switch (value) {
      ModerationAgeFilter.underHour => '< 1h',
      ModerationAgeFilter.underDay => '< 24h',
      ModerationAgeFilter.underWeek => '< 7d',
      ModerationAgeFilter.all => 'All',
    };
  }

  String _formatQueue(ModerationQueueFilter value) {
    return switch (value) {
      ModerationQueueFilter.defaultQueue => 'Default',
      ModerationQueueFilter.escalated => 'Escalated',
      ModerationQueueFilter.policyTest => 'Policy test',
      ModerationQueueFilter.all => 'All',
    };
  }
}

class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

// ignore_for_file: public_member_api_docs, deprecated_member_use

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';

class ModerationAuditTab extends ConsumerStatefulWidget {
  const ModerationAuditTab({super.key});

  @override
  ConsumerState<ModerationAuditTab> createState() => _ModerationAuditTabState();
}

class _ModerationAuditTabState extends ConsumerState<ModerationAuditTab> {
  final _contentIdController = TextEditingController();
  final _userIdController = TextEditingController();
  final _moderatorIdController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  ModerationAuditActionFilter _action = ModerationAuditActionFilter.all;
  DateTimeRange? _range;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _contentIdController.dispose();
    _userIdController.dispose();
    _moderatorIdController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 120) {
      ref.read(moderationAuditProvider.notifier).loadMore();
    }
  }

  void _search() {
    final filters = ModerationAuditSearchFilters(
      contentId: _contentIdController.text.trim().isEmpty
          ? null
          : _contentIdController.text.trim(),
      userId: _userIdController.text.trim().isEmpty
          ? null
          : _userIdController.text.trim(),
      moderatorId: _moderatorIdController.text.trim().isEmpty
          ? null
          : _moderatorIdController.text.trim(),
      action: _action,
      from: _range?.start,
      to: _range?.end,
    );
    ref.read(moderationAuditProvider.notifier).search(filters);
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 3),
      lastDate: now,
      initialDateRange: _range,
    );
    if (picked != null) {
      setState(() => _range = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(moderationAuditProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              _buildTextField('Content ID', _contentIdController),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _buildTextField('User ID', _userIdController),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField(
                      'Moderator ID',
                      _moderatorIdController,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<ModerationAuditActionFilter>(
                      value: _action,
                      decoration: const InputDecoration(labelText: 'Action'),
                      items: ModerationAuditActionFilter.values
                          .map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text(value.name),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _action = value);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextButton(
                      onPressed: _pickRange,
                      child: Text(
                        _range == null
                            ? 'Any date range'
                            : '${_formatDate(_range!.start)} - ${_formatDate(_range!.end)}',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _search,
                      child: const Text('Search'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _contentIdController.clear();
                        _userIdController.clear();
                        _moderatorIdController.clear();
                        _range = null;
                        _action = ModerationAuditActionFilter.all;
                      });
                      _search();
                    },
                    child: const Text('Reset'),
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: Builder(
            builder: (context) {
              if (state.isLoading && state.entries.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }
              if (state.errorMessage != null && state.entries.isEmpty) {
                return Center(child: Text(state.errorMessage!));
              }
              if (state.entries.isEmpty) {
                return const Center(
                  child: Text('No audit entries match these filters.'),
                );
              }

              return ListView.separated(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                itemCount: state.entries.length + (state.isLoadingMore ? 1 : 0),
                separatorBuilder: (_, __) => const Divider(),
                itemBuilder: (context, index) {
                  if (state.isLoadingMore && index == state.entries.length) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final entry = state.entries[index];
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Theme.of(
                        context,
                      ).colorScheme.primary.withValues(alpha: 0.2),
                      child: Icon(
                        _iconForAction(entry.action),
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    title: Text(
                      '${_actionLabel(entry.action)} • ${entry.caseId}',
                    ),
                    subtitle: Text(entry.details),
                    trailing: Text(
                      _relativeTime(entry.timestamp),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTextField(String label, TextEditingController controller) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(labelText: label),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  IconData _iconForAction(ModerationAuditActionType action) {
    return switch (action) {
      ModerationAuditActionType.flagged => Icons.flag,
      ModerationAuditActionType.aiEvaluated => Icons.memory,
      ModerationAuditActionType.communityVote => Icons.how_to_vote,
      ModerationAuditActionType.decision => Icons.rule,
      ModerationAuditActionType.escalation => Icons.arrow_upward,
      ModerationAuditActionType.appeal => Icons.chat,
    };
  }

  String _actionLabel(ModerationAuditActionType action) {
    return switch (action) {
      ModerationAuditActionType.flagged => 'Flagged',
      ModerationAuditActionType.aiEvaluated => 'AI signal',
      ModerationAuditActionType.communityVote => 'Community vote',
      ModerationAuditActionType.decision => 'Moderator decision',
      ModerationAuditActionType.escalation => 'Escalation',
      ModerationAuditActionType.appeal => 'Appeal',
    };
  }

  String _relativeTime(DateTime timestamp) {
    final diff = DateTime.now().difference(timestamp);
    if (diff < const Duration(minutes: 1)) return 'Just now';
    if (diff < const Duration(hours: 1)) return '${diff.inMinutes}m ago';
    if (diff < const Duration(days: 1)) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/ui/theme/spacing.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Provider (filter-aware, cursor-paginated)
// ─────────────────────────────────────────────────────────────────────────────

/// Fetch one page of ledger entries for the given [filter].
/// Returns `(entries, nextCursor)`.
final _ledgerPageProvider =
    FutureProvider.family<
      ({List<LedgerEntry> entries, String? nextCursor}),
      String
    >((ref, filter) async {
      final token = await ref.watch(jwtProvider.future);
      if (token == null || token.isEmpty) {
        return (entries: const <LedgerEntry>[], nextCursor: null);
      }
      try {
        final dio = ref.read(secureDioProvider);
        final response = await dio.get<Map<String, dynamic>>(
          '/reputation/me/ledger',
          queryParameters: {'filter': filter, 'limit': '20'},
        );
        final data = response.data ?? {};
        final entriesJson = data['entries'] as List<dynamic>? ?? [];
        final entries = entriesJson
            .map((e) => LedgerEntry.fromJson(e as Map<String, dynamic>))
            .toList();
        return (entries: entries, nextCursor: data['nextCursor'] as String?);
      } catch (_) {
        return (entries: const <LedgerEntry>[], nextCursor: null);
      }
    });

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

class ReputationLedgerScreen extends ConsumerStatefulWidget {
  const ReputationLedgerScreen({super.key});

  @override
  ConsumerState<ReputationLedgerScreen> createState() =>
      _ReputationLedgerScreenState();
}

class _ReputationLedgerScreenState extends ConsumerState<ReputationLedgerScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  static const _filters = [
    'all',
    'positive',
    'neutral',
    'negative',
    'appeal',
    'expired',
  ];
  static const _filterLabels = [
    'All',
    'Positive',
    'Neutral',
    'Negative',
    'Appeals',
    'Expired',
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _filters.length, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reputation Activity'),
        bottom: TabBar(
          controller: _tabs,
          tabs: _filterLabels.map((l) => Tab(text: l)).toList(),
        ),
      ),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Reputation Activity is read-only. Entries cannot be edited or removed.',
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: _filters
                  .map((filter) => _LedgerList(filter: filter))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tab list
// ─────────────────────────────────────────────────────────────────────────────

class _LedgerList extends ConsumerWidget {
  const _LedgerList({required this.filter});
  final String filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(_ledgerPageProvider(filter));
    return asyncPage.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Could not load reputation history.'),
            const SizedBox(height: Spacing.sm),
            TextButton(
              onPressed: () => ref.refresh(_ledgerPageProvider(filter)),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (page) {
        final entries = page.entries;
        if (entries.isEmpty) {
          return const Center(child: Text('No entries yet.'));
        }
        return RefreshIndicator(
          onRefresh: () async => ref.refresh(_ledgerPageProvider(filter)),
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
            itemCount: entries.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) =>
                _LedgerEntryTile(filter: filter, entry: entries[i]),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual entry tile
// ─────────────────────────────────────────────────────────────────────────────

class _LedgerEntryTile extends ConsumerStatefulWidget {
  const _LedgerEntryTile({required this.filter, required this.entry});
  final String filter;
  final LedgerEntry entry;

  @override
  ConsumerState<_LedgerEntryTile> createState() => _LedgerEntryTileState();
}

class _LedgerEntryTileState extends ConsumerState<_LedgerEntryTile> {
  bool _appealing = false;

  Future<void> _submitAppeal() async {
    if (_appealing) {
      return;
    }

    setState(() => _appealing = true);
    try {
      final dio = ref.read(secureDioProvider);
      await dio.post<void>('/moderation/ledger/${widget.entry.id}/appeal');
      if (!mounted) {
        return;
      }
      ref.invalidate(_ledgerPageProvider(widget.filter));
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Appeal submitted.')));
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Could not submit appeal.')));
    } finally {
      if (mounted) {
        setState(() => _appealing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final entry = widget.entry;
    final isPositive = entry.eventCategory == 'positive';
    final isNeutral = entry.eventCategory == 'neutral';
    final isNegative = entry.eventCategory == 'negative';
    final isExpired = entry.status == 'expired';

    final bandColor = isPositive
        ? Colors.green.shade600
        : isNeutral
        ? scheme.tertiary
        : isNegative
        ? scheme.error
        : isExpired
        ? scheme.outline
        : scheme.onSurfaceVariant;

    final bandIcon = isPositive
        ? Icons.arrow_upward
        : isNeutral
        ? Icons.remove
        : isNegative
        ? Icons.arrow_downward
        : isExpired
        ? Icons.schedule
        : Icons.remove;

    final dateStr = _formatDate(entry.createdAt);

    return ListTile(
      leading: CircleAvatar(
        radius: 18,
        backgroundColor: bandColor.withValues(alpha: 0.12),
        child: Icon(bandIcon, size: 16, color: bandColor),
      ),
      title: Text(
        entry.publicLabel,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        '$dateStr · ${_pillarLabel(entry.pillar)}',
        style: theme.textTheme.bodySmall?.copyWith(
          color: scheme.onSurfaceVariant,
        ),
      ),
      trailing: entry.appealable && entry.appealStatus == null
          ? TextButton.icon(
              onPressed: _appealing ? null : _submitAppeal,
              icon: _appealing
                  ? SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: scheme.primary,
                      ),
                    )
                  : Icon(Icons.gavel_outlined, size: 16, color: scheme.outline),
              label: const Text('Appeal'),
            )
          : null,
    );
  }

  static String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays > 30) {
      return '${dt.day}/${dt.month}/${dt.year}';
    }
    if (diff.inDays >= 1) return '${diff.inDays}d ago';
    if (diff.inHours >= 1) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }

  static String _pillarLabel(String pillar) {
    return switch (pillar) {
      'human_contribution' => 'Human contribution',
      'content_quality' => 'Content quality',
      'behaviour_trust' => 'Behaviour',
      'interaction_quality' => 'Interactions',
      'verification_strength' => 'Verification',
      'community_trust' => 'Community',
      _ => pillar,
    };
  }
}

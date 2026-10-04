// ignore_for_file: public_member_api_docs

// ignore_for_file: use_build_context_synchronously

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class MonthlyReputationTrackerCard extends ConsumerWidget {
  const MonthlyReputationTrackerCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final monthly = ref.watch(monthlyRewardsViewProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: monthly.when(
          loading: () => const _TrackerMessage(
            icon: Icons.hourglass_empty,
            title: 'Monthly reputation',
            message: 'Loading your private monthly status…',
          ),
          error: (_, __) => _TrackerMessage(
            icon: Icons.lock_outline,
            title: 'Monthly reputation',
            message: 'Your private monthly status is unavailable right now.',
            action: TextButton(
              onPressed: () => ref.invalidate(monthlyRewardsViewProvider),
              child: const Text('Retry'),
            ),
          ),
          data: (view) => _TrackerMessage(
            icon: view.currentLevel == null
                ? Icons.hourglass_empty
                : Icons.insights_outlined,
            title: view.currentLevel == null
                ? 'Monthly level pending'
                : 'Level ${view.currentLevel} confirmed',
            message: view.currentLevel == null
                ? _pendingMessage(view.reasonCode)
                : 'This level is fixed for ${view.effectiveMonth ?? 'the current month'}. Activity in that month is assessed for the next calendar month.',
            detail: view.sourceScore == null || view.sourceMonth == null
                ? null
                : 'Server-assessed ${view.sourceMonth} source score: ${view.sourceScore} of 13,500.',
            action: TextButton(
              onPressed: () => ref.invalidate(monthlyRewardsViewProvider),
              child: const Text('Refresh'),
            ),
          ),
        ),
      ),
    );
  }
}

class MonthlyReputationReportCard extends ConsumerStatefulWidget {
  const MonthlyReputationReportCard({super.key});

  @override
  ConsumerState<MonthlyReputationReportCard> createState() =>
      _MonthlyReputationReportCardState();
}

class _MonthlyReputationReportCardState
    extends ConsumerState<MonthlyReputationReportCard> {
  late String _sourceMonth = _shiftMonth(_utcMonth(DateTime.now().toUtc()), -1);
  bool _exporting = false;

  String get _currentMonth => _utcMonth(DateTime.now().toUtc());

  void _shift(int delta) {
    setState(() => _sourceMonth = _shiftMonth(_sourceMonth, delta));
  }

  Future<void> _exportCsv() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      ref.invalidate(monthlyReputationCsvProvider(_sourceMonth));
      final bytes = await ref.read(monthlyReputationCsvProvider(_sourceMonth).future);
      if (!mounted) return;
      final filename = 'monthly-reputation-$_sourceMonth.csv';
      final file = XFile.fromData(bytes, name: filename, mimeType: 'text/csv');
      if (kIsWeb) {
        await file.saveTo(filename);
      } else if (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS) {
        final box = context.findRenderObject() as RenderBox?;
        await SharePlus.instance.share(
          ShareParams(
            files: [file],
            fileNameOverrides: [filename],
            sharePositionOrigin: box == null
                ? null
                : box.localToGlobal(Offset.zero) & box.size,
          ),
        );
      } else {
        final destination = await getSaveLocation(suggestedName: filename);
        if (destination != null && mounted) await file.saveTo(destination.path);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('The monthly report could not be exported. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(monthlyReputationReportProvider(_sourceMonth));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your monthly report', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: Spacing.xs),
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous source month',
                  onPressed: () => _shift(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(child: Text(_sourceMonth, textAlign: TextAlign.center)),
                IconButton(
                  tooltip: 'Next source month',
                  onPressed: _sourceMonth.compareTo(_currentMonth) < 0
                      ? () => _shift(1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: Spacing.xs),
            reportAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Your private monthly report is unavailable right now.'),
                  TextButton(
                    onPressed: () => ref.invalidate(monthlyReputationReportProvider(_sourceMonth)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
              data: (report) => _reportBody(context, ref, report),
            ),
            const SizedBox(height: Spacing.sm),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: _exporting ? null : _exportCsv,
                icon: _exporting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.download_outlined),
                label: Text(_exporting ? 'Preparing CSV…' : 'Export CSV'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reportBody(BuildContext context, WidgetRef ref, Map<String, dynamic> report) {
    final state = report['reportState'] as String? ?? 'pending';
    final detail = _object(report['report']);
    final total = _object(detail['total']);
    final weekly = _object(detail['weekly']);
    final monthly = _object(detail['monthly']);
    final email = _object(detail['quarterlyEmail']);
    final selected = _list(weekly['selectedWeeks']);
    final omitted = _list(weekly['omittedWeeks']);
    final actions = _list(monthly['actions']);
    final emailEvidence = _object(email['evidence']);

    if (detail.isEmpty) {
      final reason = report['reasonCode'] as String?;
      return Text(_pendingMessage(reason));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (state == 'shadow')
          const Text('This source assessment is still in shadow mode; it does not activate rewards.'),
        if (total.isNotEmpty) ...[
          const SizedBox(height: Spacing.xs),
          Text('Source score: ${total['sourceScore']} of ${total['maximumSourceMonth']}'),
          Text('Weekly: ${total['weeklyPoints']} · Monthly: ${total['monthlyPoints']} · Quarterly email: ${total['quarterlyPoints']}'),
        ],
        const SizedBox(height: Spacing.xs),
        Text('Selected assigned weeks: ${selected.length} · Omitted: ${omitted.length}'),
        Text('Quarterly email: ${emailEvidence['state'] ?? 'not yet valid'} · ${email['points'] ?? 0} of ${email['maximumPoints'] ?? 1000}'),
        if (actions.isNotEmpty) ...[
          const SizedBox(height: Spacing.xs),
          Text('Monthly action evidence', style: Theme.of(context).textTheme.titleSmall),
          for (final actionValue in actions)
            Builder(builder: (_) {
              final action = _object(actionValue);
              return Padding(
                padding: const EdgeInsets.only(top: Spacing.xs),
                child: Text('${action['actionId']}: ${action['points'] ?? 0} points · ${action['state'] ?? 'pending'} · allowance ${action['allowance'] ?? 0}'),
              );
            }),
        ],
        TextButton(
          onPressed: () => ref.invalidate(monthlyReputationReportProvider(_sourceMonth)),
          child: const Text('Refresh report'),
        ),
      ],
    );
  }
}

class _TrackerMessage extends StatelessWidget {
  const _TrackerMessage({required this.icon, required this.title, required this.message, this.detail, this.action});

  final IconData icon;
  final String title;
  final String message;
  final String? detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(children: [Icon(icon), const SizedBox(width: Spacing.sm), Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium))]),
      const SizedBox(height: Spacing.xs),
      Text(message),
      if (detail != null) ...[const SizedBox(height: Spacing.xs), Text(detail!)],
      if (action != null) Align(alignment: Alignment.centerRight, child: action!),
    ],
  );
}

Map<String, dynamic> _object(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<dynamic> _list(Object? value) => value is List ? value : const [];

String _pendingMessage(String? reason) => switch (reason) {
      'approval_unavailable' || 'report_unavailable' => 'Monthly scoring and rewards are pending owner approval. No score or entitlement has been activated.',
      'source_not_assembled' || 'assembly_pending' => 'This source month has not been assembled yet.',
      'assessment_pending' => 'This source month is waiting for its server assessment.',
      'settlement_pending' || 'confirmed_month_unavailable' => 'The fixed monthly level is waiting for settlement and review.',
      _ => 'No server-assessed report is available for this month yet.',
    };

String _utcMonth(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';

String _shiftMonth(String month, int offset) {
  final parts = month.split('-');
  final date = DateTime.utc(int.parse(parts[0]), int.parse(parts[1]) + offset);
  return _utcMonth(date);
}

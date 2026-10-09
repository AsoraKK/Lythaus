// ignore_for_file: public_member_api_docs

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;
import 'package:share_plus/share_plus.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/monthly_reputation_presentation.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class MonthlyReputationTrackerCard extends ConsumerWidget {
  const MonthlyReputationTrackerCard({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(currentUserProvider) == null ||
        ref.watch(guestModeProvider)) {
      return const _PrivateStatus();
    }
    final monthly = ref.watch(monthlyRewardsViewProvider);
    final sourceMonth = _utcMonth(DateTime.now().toUtc());
    final progress = ref.watch(monthlyReputationReportProvider(sourceMonth));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _heading(context, 'Monthly reputation'),
            const SizedBox(height: Spacing.sm),
            monthly.when(
              skipLoadingOnReload: false,
              skipLoadingOnRefresh: false,
              loading: () =>
                  const _LoadingStatus('Loading your private monthly status…'),
              error: (_, __) => _UnavailableStatus(
                message:
                    'Your private monthly status is unavailable right now.',
                retry: () => ref.invalidate(monthlyRewardsViewProvider),
              ),
              data: (view) {
                final snapshot = view.snapshot.toMap().map(
                  (key, value) => MapEntry(key, value?.value),
                );
                final level = view.currentLevel;
                final historicalSnapshot =
                    snapshot['policyVersion'] == historicalMonthlyPolicy &&
                    level != null &&
                    level >= 1 &&
                    level <= 5 &&
                    view.sourceScore != null &&
                    view.sourceScore! >= 0 &&
                    view.sourceScore! <= 13500;
                final confirmed =
                    snapshot['state'] == 'confirmed' && historicalSnapshot;
                final shadow = snapshot['state'] == 'shadow';
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _statusHeading(
                      context,
                      confirmed
                          ? 'Level $level confirmed'
                          : shadow
                          ? 'Monthly level in shadow'
                          : 'Monthly level pending',
                    ),
                    Text(
                      confirmed
                          ? 'Fixed for ${evidenceMonth(view.effectiveMonth)}. Current progress cannot change this snapshot.'
                          : shadow
                          ? 'Shadow source snapshot. This is not a confirmed entitlement. Rewards remain disabled.'
                          : _pendingMessage(
                              evidenceText(snapshot['reasonCode']) ??
                                  view.reasonCode,
                            ),
                    ),
                    if (snapshot['state'] == 'unavailable')
                      const Text('Snapshot unavailable.'),
                    if (shadow && historicalSnapshot)
                      Text('Shadow level $level · not confirmed.'),
                    if (confirmed || (shadow && historicalSnapshot)) ...[
                      Text('Source month: ${evidenceMonth(view.sourceMonth)}'),
                      Text(
                        'Server-assessed source score: ${evidencePoints(view.sourceScore)} · historical v1 maximum 13,500.',
                      ),
                      if (evidenceInteger(snapshot['revision']) != null)
                        Text(
                          'Snapshot revision ${evidencePoints(snapshot['revision'])} · source revision ${evidencePoints(snapshot['sourceRevision'])}.',
                        ),
                    ],
                    const SizedBox(height: Spacing.xs),
                    const Text(
                      'Following-month projection unavailable. V2 scoring and reward activation remain disabled.',
                    ),
                    _DisabledMethodology(readiness: view.responsePreparation),
                    TextButton(
                      onPressed: () =>
                          ref.invalidate(monthlyRewardsViewProvider),
                      child: const Text('Refresh status'),
                    ),
                  ],
                );
              },
            ),
            const Divider(),
            _heading(
              context,
              'Current progress · ${evidenceMonth(sourceMonth)}',
            ),
            progress.when(
              skipLoadingOnReload: false,
              skipLoadingOnRefresh: false,
              loading: () =>
                  const _LoadingStatus('Loading current source evidence…'),
              error: (_, __) => _UnavailableStatus(
                message: 'Current source evidence is unavailable.',
                retry: () => ref.invalidate(
                  monthlyReputationReportProvider(sourceMonth),
                ),
              ),
              data: (report) {
                final total = evidenceObject(
                  monthlyReportDetail(report)['total'],
                );
                final score = evidenceInteger(total['sourceScore']);
                return Text(
                  score == null ||
                          total['maximumSourceMonth'] != 13500 ||
                          score > 13500
                      ? _pendingMessage(report.reasonCode)
                      : 'Server-reported source assessment: ${evidencePoints(score)} of 13,500 (v1). This is source evidence; it grants no following-month entitlement.',
                );
              },
            ),
          ],
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
  late String _sourceMonth = _utcMonth(DateTime.now().toUtc());
  int? _sessionRevision;
  bool _exporting = false;
  String get _currentMonth => _utcMonth(DateTime.now().toUtc());
  void _shift(int delta) =>
      setState(() => _sourceMonth = _shiftMonth(_sourceMonth, delta));

  Future<void> _exportCsv() async {
    if (_exporting) return;
    final month = _sourceMonth;
    final revision = ref.read(authSessionRevisionProvider);
    bool stillOwnsExport() =>
        mounted &&
        ref.read(authSessionRevisionProvider) == revision &&
        ref.read(currentUserProvider) != null &&
        !ref.read(guestModeProvider) &&
        _sourceMonth == month;
    setState(() => _exporting = true);
    final provider = monthlyReputationCsvProvider(month);
    ref.invalidate(provider);
    final exportSubscription = ref.listenManual(provider, (_, _) {});
    final stopOnSessionChange = ref
        .read(authSessionRevisionProvider.notifier)
        .cancelOnChange(exportSubscription.close);
    try {
      final bytes = await ref.read(provider.future);
      if (!mounted || !stillOwnsExport()) return;
      final filename = 'monthly-reputation-$month.csv';
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
        if (destination != null && stillOwnsExport()) {
          await file.saveTo(destination.path);
        }
      }
    } catch (_) {
      if (mounted && stillOwnsExport()) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'The monthly report could not be exported. Please try again.',
            ),
          ),
        );
      }
    } finally {
      stopOnSessionChange();
      exportSubscription.close();
      if (mounted && ref.read(authSessionRevisionProvider) == revision) {
        setState(() => _exporting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final revision = ref.watch(authSessionRevisionProvider);
    if (_sessionRevision != revision) {
      _sourceMonth = _currentMonth;
      _sessionRevision = revision;
      _exporting = false;
    }
    if (ref.watch(currentUserProvider) == null ||
        ref.watch(guestModeProvider)) {
      return const _PrivateStatus();
    }
    final provider = monthlyReputationReportProvider(_sourceMonth);
    final reportAsync = ref.watch(provider);
    final loaded = reportAsync.asData?.value;
    final canExport =
        !reportAsync.isLoading &&
        loaded != null &&
        loaded.policyVersion == historicalMonthlyPolicy &&
        loaded.report != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _heading(context, 'Your monthly report'),
            const Text(
              'Private source evidence, grouped by the server. It does not grant rewards.',
            ),
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous source month',
                  onPressed: _exporting ? null : () => _shift(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    evidenceMonth(_sourceMonth),
                    textAlign: TextAlign.center,
                  ),
                ),
                IconButton(
                  tooltip: 'Next source month',
                  onPressed:
                      !_exporting && _sourceMonth.compareTo(_currentMonth) < 0
                      ? () => _shift(1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            reportAsync.when(
              skipLoadingOnReload: false,
              skipLoadingOnRefresh: false,
              loading: () =>
                  const _LoadingStatus('Loading your private monthly report…'),
              error: (_, __) => _UnavailableStatus(
                message:
                    'Your private monthly report is unavailable right now.',
                retry: () => ref.invalidate(provider),
              ),
              data: (report) => _ReportEvidence(report: report),
            ),
            Wrap(
              spacing: Spacing.sm,
              runSpacing: Spacing.xs,
              children: [
                TextButton(
                  onPressed: () => ref.invalidate(provider),
                  child: const Text('Refresh report'),
                ),
                OutlinedButton.icon(
                  onPressed: canExport && !_exporting ? _exportCsv : null,
                  icon: const Icon(Icons.download_outlined),
                  label: Text(_exporting ? 'Preparing CSV…' : 'Export CSV'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportEvidence extends StatelessWidget {
  const _ReportEvidence({required this.report});
  final api.MonthlyReputationReportResponse report;
  @override
  Widget build(BuildContext context) {
    final detail = monthlyReportDetail(report);
    final weekly = evidenceObject(detail['weekly']);
    final monthly = evidenceObject(detail['monthly']);
    final email = evidenceObject(detail['quarterlyEmail']);
    final total = evidenceObject(detail['total']);
    final score = evidenceInteger(total['sourceScore']);
    final validTotal =
        score != null && score <= 13500 && total['maximumSourceMonth'] == 13500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (report.policyVersion != historicalMonthlyPolicy)
          const Text(
            'This report policy is unavailable in this presentation. No score or entitlement is inferred.',
          )
        else if (detail.isEmpty)
          Text(_pendingMessage(report.reasonCode))
        else ...[
          const Text('Historical v1 source assessment · maximum 13,500.'),
          if (report.reportState ==
              api.MonthlyReputationReportResponseReportStateEnum.shadow)
            const Text('Shadow assessment. It does not activate rewards.'),
          Text(
            validTotal
                ? 'Source score: ${evidencePoints(score)} of 13,500'
                : 'Source score unavailable',
          ),
          Text(
            'Recorded: ${evidenceDate(detail['sourceRecordedAt'])} · source revision ${evidencePoints(detail['sourceRevision'])}',
          ),
          Text(
            'Server-designated effective month: ${evidenceMonth(report.effectiveMonth)}. Confirmation requires a settled server snapshot.',
          ),
          _EvidenceSection(
            title: 'Selected weeks',
            subtitle:
                '${evidencePoints(weekly['points'])} of ${evidencePoints(weekly['maximumSelectedWeeklyPoints'])} · whole weekly totals',
            children: _weeks(weekly['selectedWeeks']),
          ),
          _EvidenceSection(
            title: 'Omitted weeks',
            subtitle:
                'Server selection; omitted totals receive no credit here.',
            children: _weeks(weekly['omittedWeeks']),
          ),
          if (evidenceList(weekly['missingWeeks']).isNotEmpty)
            _EvidenceSection(
              title: 'Missing weeks',
              children: _weeks(weekly['missingWeeks']),
            ),
          if (evidenceList(weekly['unassessedWeeks']).isNotEmpty)
            _EvidenceSection(
              title: 'Unassessed weeks',
              children: _weeks(weekly['unassessedWeeks']),
            ),
          _EvidenceSection(
            title: 'Monthly action evidence',
            subtitle:
                '${evidencePoints(monthly['points'])} of ${evidencePoints(monthly['maximumPoints'])}',
            children: evidenceList(
              monthly['actions'],
            ).map(_ActionEvidence.new).toList(),
          ),
          _EvidenceSection(
            title: 'Quarterly email evidence (v1)',
            subtitle:
                '${evidencePoints(email['points'])} of ${evidencePoints(email['maximumPoints'])}',
            children: [
              if (email['evidence'] != null)
                _ActionEvidence(evidenceObject(email['evidence']))
              else
                const Text(
                  'No quarterly evidence returned. Dates and points are unknown.',
                ),
            ],
          ),
        ],
        if (report.policyVersion == historicalMonthlyPolicy &&
            (report.corrections.sourceRevisions.isNotEmpty ||
                report.corrections.effectiveSnapshots.isNotEmpty))
          _EvidenceSection(
            title: 'Corrections',
            subtitle:
                'Source revisions do not rewrite the fixed monthly level.',
            children: [
              for (final correction in report.corrections.sourceRevisions)
                _CorrectionEvidence(
                  'Source',
                  correction.toMap().map(
                    (key, value) => MapEntry(key, value?.value),
                  ),
                ),
              for (final correction in report.corrections.effectiveSnapshots)
                _CorrectionEvidence(
                  'Snapshot',
                  correction.toMap().map(
                    (key, value) => MapEntry(key, value?.value),
                  ),
                ),
            ],
          ),
        Text('Source policy: ${report.policyVersion}'),
        _DisabledMethodology(readiness: report.responsePreparation),
      ],
    );
  }

  List<Widget> _weeks(Object? value) => evidenceList(value)
      .map(
        (week) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${evidenceDate(week['startsAt'])} – ${evidenceDate(week['endsAt'])}',
            ),
            Text(
              '${evidencePoints(week['points'])} points · ${evidenceText(week['state']) ?? 'Unknown state'} · revision ${evidencePoints(week['revision'])}',
            ),
            if (evidenceText(week['selectionReason']) != null)
              Text(
                'Selection: ${evidenceText(week['selectionReason'])!.replaceAll('_', ' ')}',
              ),
            for (final action in evidenceList(week['actions']))
              _ActionEvidence(action),
            const SizedBox(height: Spacing.sm),
          ],
        ),
      )
      .toList();
}

class _ActionEvidence extends StatelessWidget {
  const _ActionEvidence(this.action);
  final Map<String, Object?> action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: Spacing.sm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          evidenceText(action['actionId']) ?? 'Unknown action',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        Text(
          '${evidencePoints(action['points'])} points · ${evidenceText(action['state']) ?? 'Unknown state'}',
        ),
        Text(
          'Cap group: ${evidenceText(action['capGroup']) ?? 'Unknown'} · allowance ${evidencePoints(action['allowance'])} · remaining ${evidencePoints(action['remainingInGroup'])}',
        ),
        Text(
          'Accepted ${evidencePoints(action['accepted'])} · pending ${evidencePoints(action['pending'])} · withheld ${evidencePoints(action['withheld'])}',
        ),
        Text(
          'Valid from ${evidenceDate(action['validFrom'])} · until ${evidenceDate(action['validUntil'])}',
        ),
        if (evidenceText(action['reasonCode']) != null)
          Text('Reason: ${action['reasonCode']}'),
      ],
    ),
  );
}

class _CorrectionEvidence extends StatelessWidget {
  const _CorrectionEvidence(this.kind, this.correction);
  final String kind;
  final Map<String, Object?> correction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: Spacing.sm),
    child: Text(
      '$kind revision ${evidencePoints(correction['revision'] ?? correction['sourceRevision'])} · ${evidenceDate(correction['recordedAt'])} · source score ${evidencePoints(correction['sourceScore'])} · ${evidenceText(correction['reasonCode']) ?? 'Reason unknown'}',
    ),
  );
}

class _EvidenceSection extends StatelessWidget {
  const _EvidenceSection({
    required this.title,
    this.subtitle,
    required this.children,
  });
  final String title;
  final String? subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    child: ExpansionTile(
      internalAddSemanticForOnTap: true,
      expansionAnimationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: Spacing.sm),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      expandedAlignment: Alignment.centerLeft,
      children: children.isEmpty
          ? [const Text('No evidence returned.')]
          : children,
    ),
  );
}

class _DisabledMethodology extends StatelessWidget {
  const _DisabledMethodology({required this.readiness});
  final api.MonthlyResponsePreparationReadiness? readiness;
  @override
  Widget build(BuildContext context) {
    if (!hasDisabledMethodology(readiness)) {
      return const Text(
        'V2 preparation metadata unavailable. Scoring and rewards remain disabled.',
      );
    }
    return _EvidenceSection(
      title: 'Disabled v2 methodology',
      subtitle: 'Preparation only · no active earning',
      children: [
        Text(
          'Prospective maximum: ${evidencePoints(readiness!.maximumSourceMonth)}. Four whole weekly totals of 2,500, monthly 2,500, email 1,000 and optional suggestion 150.',
        ),
        const Text(
          'Quarterly awards would be valid from completion month through that calendar quarter’s end. No earlier credit and no carry into the next quarter. Lower level thresholds remain unchanged.',
        ),
        const Text(
          'This methodology applies no points and grants no reward entitlement. Historical v1 remains 13,500.',
        ),
        Text(
          'Policy: ${readiness!.policyVersion} · data version ${readiness!.dataVersion}',
        ),
        Text('Response: ${readiness!.responseVersion}'),
        Text('Catalogue: ${readiness!.catalogueHash}'),
      ],
    );
  }
}

class _PrivateStatus extends StatelessWidget {
  const _PrivateStatus();
  @override
  Widget build(BuildContext context) => const Card(
    child: Padding(
      padding: EdgeInsets.all(Spacing.md),
      child: Text('Sign in to view your private monthly reputation.'),
    ),
  );
}

class _LoadingStatus extends StatelessWidget {
  const _LoadingStatus(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [Text(message), const LinearProgressIndicator()],
    ),
  );
}

class _UnavailableStatus extends StatelessWidget {
  const _UnavailableStatus({required this.message, required this.retry});
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    liveRegion: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(message),
        TextButton(onPressed: retry, child: const Text('Retry')),
      ],
    ),
  );
}

Widget _heading(BuildContext context, String title) => Semantics(
  header: true,
  child: Text(title, style: Theme.of(context).textTheme.titleMedium),
);
Widget _statusHeading(BuildContext context, String title) => Semantics(
  container: true,
  label: title,
  excludeSemantics: true,
  child: Text(title, style: Theme.of(context).textTheme.titleMedium),
);
String _utcMonth(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';
String _shiftMonth(String month, int delta) => _utcMonth(
  DateTime.utc(
    int.parse(month.substring(0, 4)),
    int.parse(month.substring(5, 7)) + delta,
  ),
);
String _pendingMessage(String? reason) => switch (reason) {
  'approval_unavailable' || 'report_unavailable' =>
    'Monthly scoring and rewards are pending owner approval. No score or entitlement has been activated.',
  'source_not_assembled' ||
  'assembly_pending' => 'This source month has not been assembled yet.',
  'assessment_pending' =>
    'This source month is waiting for its server assessment.',
  'settlement_pending' || 'confirmed_month_unavailable' =>
    'The fixed monthly level is waiting for settlement and review.',
  'no_previous_assessment' =>
    'No previous source assessment is available. The unassessed default is not a confirmed level.',
  'before_policy_cutover' =>
    'This month is before the approved policy cutover. No entitlement is available.',
  'future_month_unconfirmed' =>
    'This future month has no confirmed entitlement.',
  'snapshot_policy_requires_review' =>
    'The snapshot policy needs review. No confirmed entitlement is available.',
  _ => 'No server-assessed report is available for this month yet.',
};

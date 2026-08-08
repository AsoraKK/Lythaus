// ignore_for_file: public_member_api_docs, deprecated_member_use

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/components/lyth_chip.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_audit_timeline.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_decision_panel.dart';

class ModerationCaseScreen extends ConsumerWidget {
  const ModerationCaseScreen({super.key, required this.caseId});

  final String caseId;

  static const List<String> _escalationQueues = [
    'Trust & Safety',
    'Legal',
    'Policy QA',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(moderationCaseProvider(caseId));
    final notifier = ref.read(moderationCaseProvider(caseId).notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Moderation Case')),
      body: Builder(
        builder: (context) {
          if (state.isLoading && state.caseDetail == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.errorMessage != null && state.caseDetail == null) {
            return Center(child: Text(state.errorMessage!));
          }

          final caseDetail = state.caseDetail;
          if (caseDetail == null) {
            return const Center(child: Text('Case data is unavailable.'));
          }

          return SingleChildScrollView(
            padding: EdgeInsets.all(context.spacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (state.errorMessage != null)
                  Padding(
                    padding: EdgeInsets.only(bottom: context.spacing.md),
                    child: Text(
                      state.errorMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                _buildHeader(context, caseDetail),
                SizedBox(height: context.spacing.lg),
                _buildContentPanel(caseDetail, context),
                SizedBox(height: context.spacing.lg),
                _buildReportSection(context, caseDetail),
                SizedBox(height: context.spacing.lg),
                if (caseDetail.appealDetails != null)
                  _buildAppealSummary(context, caseDetail.appealDetails!),
                SizedBox(height: context.spacing.lg),
                ModerationDecisionPanel(
                  isSubmitting: state.decisionSubmitting,
                  onSubmit: (input) async {
                    await notifier.submitDecision(input);
                  },
                ),
                SizedBox(height: context.spacing.lg),
                LythButton.secondary(
                  label: caseDetail.escalation != null
                      ? 'Escalated to ${caseDetail.escalation!.targetQueue}'
                      : 'Escalate Case',
                  icon: Icons.arrow_upward,
                  onPressed: state.escalating
                      ? null
                      : () async {
                          final result = await _showEscalationDialog(context);
                          if (result != null) {
                            await notifier.escalate(result);
                          }
                        },
                ),
                SizedBox(height: context.spacing.xl),
                Text(
                  'Audit trail',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                SizedBox(height: context.spacing.sm),
                ModerationAuditTimeline(entries: caseDetail.auditTrail),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(BuildContext context, ModerationCase data) {
    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            data.contentType.toUpperCase(),
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.sm),
          Wrap(
            spacing: context.spacing.sm,
            children: [
              LythChip(label: data.status),
              LythChip(label: data.queue),
              LythChip(label: data.severity.name),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildContentPanel(ModerationCase data, BuildContext context) {
    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Content', style: Theme.of(context).textTheme.titleMedium),
          SizedBox(height: context.spacing.sm),
          Text(data.contentText, style: Theme.of(context).textTheme.bodyLarge),
          if (data.mediaUrl != null) ...[
            SizedBox(height: context.spacing.md),
            SizedBox(
              height: 180,
              width: double.infinity,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(context.radius.md),
                  color: Theme.of(context).colorScheme.surfaceContainerHigh,
                  image: DecorationImage(
                    image: NetworkImage(data.mediaUrl!),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildReportSection(BuildContext context, ModerationCase data) {
    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Reports',
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.sm),
          if (data.reports.isEmpty)
            const Text('No detailed reports available.')
          else
            ...data.reports.map(
              (report) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.flag),
                title: Text(report.reason),
                subtitle: Text('${report.count} report(s)'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAppealSummary(
    BuildContext context,
    ModerationAppealDetails appeal,
  ) {
    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Appeal & Community vote',
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.sm),
          Text(appeal.summary),
          SizedBox(height: context.spacing.sm),
          Row(
            children: [
              Expanded(
                child: LinearProgressIndicator(
                  value:
                      appeal.overturnVotes /
                      (appeal.overturnVotes + appeal.upholdVotes + 1),
                ),
              ),
              SizedBox(width: context.spacing.md),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Overturn: ${appeal.overturnVotes}'),
                  Text('Uphold: ${appeal.upholdVotes}'),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<ModerationEscalationInput?> _showEscalationDialog(
    BuildContext context,
  ) {
    final reasonController = TextEditingController();
    String targetQueue = _escalationQueues.first;

    return showDialog<ModerationEscalationInput>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Escalate case'),
        content: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LythTextField(
                controller: reasonController,
                label: 'Reason',
                onChanged: (_) {},
              ),
              SizedBox(height: context.spacing.md),
              DropdownButtonFormField<String>(
                value: targetQueue,
                items: _escalationQueues
                    .map(
                      (queue) =>
                          DropdownMenuItem(value: queue, child: Text(queue)),
                    )
                    .toList(),
                decoration: const InputDecoration(labelText: 'Target queue'),
                onChanged: (value) {
                  if (value != null) {
                    setState(() {
                      targetQueue = value;
                    });
                  }
                },
              ),
            ],
          ),
        ),
        actions: [
          LythButton.tertiary(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(),
          ),
          LythButton.primary(
            label: 'Escalate',
            onPressed: () {
              final reason = reasonController.text.trim();
              if (reason.isEmpty) {
                LythSnackbar.error(
                  context: context,
                  message: 'Please provide a reason.',
                );
                return;
              }
              Navigator.of(context).pop(
                ModerationEscalationInput(
                  reason: reason,
                  targetQueue: targetQueue,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

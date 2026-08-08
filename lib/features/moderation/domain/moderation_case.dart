// ignore_for_file: public_member_api_docs

import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';

/// Details for a single moderation case
class ModerationCase {
  const ModerationCase({
    required this.id,
    required this.type,
    required this.contentId,
    required this.contentType,
    required this.contentText,
    required this.status,
    required this.queue,
    required this.severity,
    required this.createdAt,
    required this.updatedAt,
    required this.reports,
    required this.aiSignals,
    required this.auditTrail,
    required this.decisionHistory,
    this.contentTitle,
    this.mediaUrl,
    this.authorHandle,
    this.escalation,
    this.appealDetails,
  });

  final String id;
  final ModerationItemType type;
  final String contentId;
  final String contentType;
  final String? contentTitle;
  final String contentText;
  final String status;
  final String queue;
  final ModerationSeverityLevel severity;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<ModerationReport> reports;
  final List<String> aiSignals;
  final List<ModerationAuditEntry> auditTrail;
  final List<ModerationDecisionHistory> decisionHistory;
  final String? mediaUrl;
  final String? authorHandle;
  final ModerationEscalationInfo? escalation;
  final ModerationAppealDetails? appealDetails;

  factory ModerationCase.fromJson(Map<String, dynamic> json) {
    final createdAtValue =
        json['createdAt']?.toString() ??
        json['created_at']?.toString() ??
        DateTime.now().toIso8601String();
    final updatedAtValue =
        json['updatedAt']?.toString() ??
        json['updated_at']?.toString() ??
        createdAtValue;

    DateTime parsedCreated;
    DateTime parsedUpdated;
    try {
      parsedCreated = DateTime.parse(createdAtValue);
    } catch (_) {
      parsedCreated = DateTime.now();
    }
    try {
      parsedUpdated = DateTime.parse(updatedAtValue);
    } catch (_) {
      parsedUpdated = parsedCreated;
    }

    final auditData =
        (json['auditTrail'] as List? ??
                json['audit'] as List? ??
                json['timeline'] as List? ??
                [])
            .cast<Map<String, dynamic>>();

    return ModerationCase(
      id:
          json['id']?.toString() ??
          json['caseId']?.toString() ??
          json['targetId']?.toString() ??
          '',
      type: ModerationQueueItem.parseItemType(json['type']?.toString()),
      contentId: json['contentId']?.toString() ?? '',
      contentType: json['contentType']?.toString() ?? 'post',
      contentTitle: json['contentTitle']?.toString(),
      contentText:
          json['contentText']?.toString() ??
          json['text']?.toString() ??
          json['body']?.toString() ??
          '',
      status: json['status']?.toString() ?? 'open',
      queue: json['queue']?.toString() ?? 'default',
      severity: ModerationQueueItem.parseSeverity(json['severity']?.toString()),
      createdAt: parsedCreated,
      updatedAt: parsedUpdated,
      reports: (json['reports'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map((entry) => ModerationReport.fromJson(entry))
          .toList(),
      aiSignals:
          ((json['aiSignals'] as List?) ?? json['aiSummary'] as List? ?? [])
              .cast<dynamic>()
              .map((e) => e?.toString() ?? '')
              .where((value) => value.isNotEmpty)
              .toList(),
      auditTrail: auditData
          .map((entry) => ModerationAuditEntry.fromJson(entry))
          .toList(),
      decisionHistory: (json['decisionHistory'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map((entry) => ModerationDecisionHistory.fromJson(entry))
          .toList(),
      mediaUrl: json['mediaUrl']?.toString(),
      authorHandle: json['authorHandle']?.toString(),
      escalation: json['escalation'] != null
          ? ModerationEscalationInfo.fromJson(
              (json['escalation'] as Map<String, dynamic>),
            )
          : null,
      appealDetails: json['appeal'] != null
          ? ModerationAppealDetails.fromJson(
              (json['appeal'] as Map<String, dynamic>),
            )
          : null,
    );
  }
}

class ModerationReport {
  const ModerationReport({
    required this.reason,
    required this.count,
    this.examples = const [],
  });

  final String reason;
  final int count;
  final List<String> examples;

  factory ModerationReport.fromJson(Map<String, dynamic> json) {
    return ModerationReport(
      reason: json['reason']?.toString() ?? 'Unknown',
      count: (json['count'] as int?) ?? (json['reasonCount'] as int?) ?? 0,
      examples: (json['examples'] as List? ?? [])
          .cast<dynamic>()
          .map((example) => example?.toString() ?? '')
          .where((value) => value.isNotEmpty)
          .toList(),
    );
  }
}

class ModerationAppealDetails {
  const ModerationAppealDetails({
    required this.appealId,
    required this.summary,
    required this.overturnVotes,
    required this.upholdVotes,
  });

  final String appealId;
  final String summary;
  final int overturnVotes;
  final int upholdVotes;

  factory ModerationAppealDetails.fromJson(Map<String, dynamic> json) {
    return ModerationAppealDetails(
      appealId: json['appealId']?.toString() ?? '',
      summary:
          json['appealText']?.toString() ??
          json['userStatement']?.toString() ??
          '',
      overturnVotes: (json['overturnVotes'] as int?) ?? 0,
      upholdVotes: (json['upholdVotes'] as int?) ?? 0,
    );
  }
}

class ModerationEscalationInfo {
  const ModerationEscalationInfo({
    required this.targetQueue,
    required this.reason,
    required this.escalatedAt,
  });

  final String targetQueue;
  final String reason;
  final DateTime escalatedAt;

  factory ModerationEscalationInfo.fromJson(Map<String, dynamic> json) {
    final escalatedAtValue =
        json['escalatedAt']?.toString() ??
        json['timestamp']?.toString() ??
        DateTime.now().toIso8601String();
    final parsed = DateTime.tryParse(escalatedAtValue) ?? DateTime.now();

    return ModerationEscalationInfo(
      targetQueue: json['targetQueue']?.toString() ?? 'Escalated',
      reason: json['reason']?.toString() ?? 'Escalated for review',
      escalatedAt: parsed,
    );
  }
}

class ModerationDecisionHistory {
  const ModerationDecisionHistory({
    required this.action,
    required this.actor,
    required this.timestamp,
    required this.rationale,
  });

  final String action;
  final String actor;
  final DateTime timestamp;
  final String rationale;

  factory ModerationDecisionHistory.fromJson(Map<String, dynamic> json) {
    final timestampValue =
        json['timestamp']?.toString() ??
        json['createdAt']?.toString() ??
        DateTime.now().toIso8601String();
    final parsed = DateTime.tryParse(timestampValue) ?? DateTime.now();

    return ModerationDecisionHistory(
      action: json['action']?.toString() ?? 'Decision',
      actor: json['actor']?.toString() ?? 'Moderator',
      timestamp: parsed,
      rationale: json['rationale']?.toString() ?? 'No rationale provided',
    );
  }
}

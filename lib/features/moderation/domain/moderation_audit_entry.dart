// ignore_for_file: public_member_api_docs

/// Audit trail models for moderation cases
library;

enum ModerationAuditActionType {
  flagged,
  aiEvaluated,
  reviewerDecision,
  decision,
  escalation,
  appeal,
}

class ModerationAuditEntry {
  const ModerationAuditEntry({
    required this.id,
    required this.caseId,
    required this.timestamp,
    required this.actorId,
    required this.actorRole,
    required this.action,
    required this.details,
  });

  final String id;
  final String caseId;
  final DateTime timestamp;
  final String actorId;
  final String actorRole;
  final ModerationAuditActionType action;
  final String details;

  factory ModerationAuditEntry.fromJson(Map<String, dynamic> json) {
    final timestampValue =
        json['timestamp']?.toString() ??
        json['createdAt']?.toString() ??
        DateTime.now().toIso8601String();
    DateTime parsed;
    try {
      parsed = DateTime.parse(timestampValue);
    } catch (_) {
      parsed = DateTime.now();
    }

    return ModerationAuditEntry(
      id: json['id']?.toString() ?? '',
      caseId: json['caseId']?.toString() ?? json['itemId']?.toString() ?? '',
      timestamp: parsed,
      actorId: json['actorId']?.toString() ?? 'system',
      actorRole: json['actorRole']?.toString() ?? 'system',
      action: _parseAction(
        json['action']?.toString() ?? json['type']?.toString(),
      ),
      details:
          json['details']?.toString() ??
          json['message']?.toString() ??
          'No details provided',
    );
  }

  static ModerationAuditActionType _parseAction(String? value) {
    switch (value?.toLowerCase()) {
      case 'flagged':
      case 'flag':
        return ModerationAuditActionType.flagged;
      case 'ai_evaluated':
      case 'ai':
        return ModerationAuditActionType.aiEvaluated;
      case 'reviewer_decision':
      case 'reviewerdecision':
        return ModerationAuditActionType.reviewerDecision;
      // Historical audit records used these values before reviewer panels.
      case 'vote':
      case 'community_vote':
        return ModerationAuditActionType.reviewerDecision;
      case 'decision':
      case 'moderator_decision':
        return ModerationAuditActionType.decision;
      case 'escalated':
        return ModerationAuditActionType.escalation;
      case 'appeal':
      default:
        return ModerationAuditActionType.appeal;
    }
  }
}

class ModerationAuditPagination {
  const ModerationAuditPagination({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.hasMore,
  });

  final int page;
  final int pageSize;
  final int total;
  final bool hasMore;

  factory ModerationAuditPagination.fromJson(Map<String, dynamic>? json) {
    return ModerationAuditPagination(
      page: (json?['page'] as int?) ?? 1,
      pageSize: (json?['pageSize'] as int?) ?? 20,
      total: (json?['total'] as int?) ?? 0,
      hasMore: (json?['hasMore'] as bool?) ?? false,
    );
  }
}

class ModerationAuditResponse {
  const ModerationAuditResponse({
    required this.entries,
    required this.pagination,
  });

  final List<ModerationAuditEntry> entries;
  final ModerationAuditPagination pagination;

  factory ModerationAuditResponse.fromJson(Map<String, dynamic> json) {
    final data =
        json['entries'] as List? ??
        json['data'] as List? ??
        json['items'] as List? ??
        [];
    final pagination = ModerationAuditPagination.fromJson(
      json['pagination'] as Map<String, dynamic>?,
    );
    return ModerationAuditResponse(
      entries: data
          .map(
            (item) =>
                ModerationAuditEntry.fromJson(item as Map<String, dynamic>),
          )
          .toList(),
      pagination: pagination,
    );
  }
}

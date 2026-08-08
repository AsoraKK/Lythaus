// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';

import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

/// Structured telemetry events for moderation workflows
class ModerationTelemetry {
  static void _log(String event, Map<String, Object> attributes) {
    final payload = {
      'event': event,
      'timestamp': DateTime.now().toIso8601String(),
      ...attributes,
    };
    debugPrint('ModerationTelemetry: $payload');
  }

  static void queueViewed(ModerationFilters filters) {
    _log('moderation.queue.viewed', {
      'filter.type': filters.itemType.name,
      'filter.severity': filters.severity.name,
      'filter.age': filters.age.name,
      'filter.queue': filters.queue.name,
    });
  }

  static void caseOpened(String caseId, {String? queue, String? severity}) {
    _log('moderation.case.opened', {
      'case_id': caseId,
      if (queue != null) 'queue': queue,
      if (severity != null) 'severity': severity,
    });
  }

  static void decisionSubmitted(
    String caseId,
    ModerationDecisionAction action,
  ) {
    _log('moderation.case.decision_submitted', {
      'case_id': caseId,
      'decision': action.name,
    });
  }

  static void caseEscalated(String caseId, String targetQueue) {
    _log('moderation.case.escalated', {
      'case_id': caseId,
      'target_queue': targetQueue,
    });
  }

  static void auditSearch(ModerationAuditSearchFilters filters) {
    _log('moderation.audit.search', {
      'content_id_present': filters.contentId != null,
      'user_id_present': filters.userId != null,
      'moderator_id_present': filters.moderatorId != null,
      'action': filters.action.name,
      'from': filters.from?.toIso8601String() ?? 'any',
      'to': filters.to?.toIso8601String() ?? 'any',
    });
  }
}

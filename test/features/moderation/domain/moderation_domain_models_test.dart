import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/core/error/error_codes.dart';

void main() {
  // ─── ModerationFilters ───
  group('ModerationFilters', () {
    test('default values', () {
      const f = ModerationFilters();
      expect(f.itemType, ModerationItemFilter.all);
      expect(f.severity, ModerationSeverityFilter.all);
      expect(f.age, ModerationAgeFilter.all);
      expect(f.queue, ModerationQueueFilter.all);
    });

    test('copyWith overrides individual fields', () {
      const f = ModerationFilters();
      final copy = f.copyWith(
        itemType: ModerationItemFilter.flag,
        severity: ModerationSeverityFilter.high,
        age: ModerationAgeFilter.underHour,
        queue: ModerationQueueFilter.escalated,
      );
      expect(copy.itemType, ModerationItemFilter.flag);
      expect(copy.severity, ModerationSeverityFilter.high);
      expect(copy.age, ModerationAgeFilter.underHour);
      expect(copy.queue, ModerationQueueFilter.escalated);
    });

    test('toQueryParams with all defaults returns empty map', () {
      const f = ModerationFilters();
      expect(f.toQueryParams(), isEmpty);
    });

    test('toQueryParams with specific filters', () {
      const f = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
        severity: ModerationSeverityFilter.medium,
        age: ModerationAgeFilter.underDay,
        queue: ModerationQueueFilter.policyTest,
      );
      final params = f.toQueryParams();
      expect(params['type'], 'appeal');
      expect(params['severity'], 'medium');
      expect(params['age'], '24h');
      expect(params['queue'], 'policy-test');
    });

    test('toQueryParams age values', () {
      expect(
        const ModerationFilters(
          age: ModerationAgeFilter.underHour,
        ).toQueryParams()['age'],
        '1h',
      );
      expect(
        const ModerationFilters(
          age: ModerationAgeFilter.underWeek,
        ).toQueryParams()['age'],
        '7d',
      );
    });

    test('toQueryParams queue values', () {
      expect(
        const ModerationFilters(
          queue: ModerationQueueFilter.defaultQueue,
        ).toQueryParams()['queue'],
        'default',
      );
      expect(
        const ModerationFilters(
          queue: ModerationQueueFilter.escalated,
        ).toQueryParams()['queue'],
        'escalated',
      );
    });
  });

  // ─── ModerationAuditSearchFilters ───
  group('ModerationAuditSearchFilters', () {
    test('default values', () {
      const f = ModerationAuditSearchFilters();
      expect(f.contentId, isNull);
      expect(f.userId, isNull);
      expect(f.moderatorId, isNull);
      expect(f.action, ModerationAuditActionFilter.all);
      expect(f.from, isNull);
      expect(f.to, isNull);
      expect(f.page, 1);
      expect(f.pageSize, 20);
    });

    test('copyWith overrides fields', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(
        contentId: 'c1',
        userId: 'u1',
        moderatorId: 'm1',
        action: ModerationAuditActionFilter.decision,
        from: DateTime(2024, 1, 1),
        to: DateTime(2024, 12, 31),
        page: 3,
        pageSize: 50,
      );
      expect(copy.contentId, 'c1');
      expect(copy.userId, 'u1');
      expect(copy.moderatorId, 'm1');
      expect(copy.action, ModerationAuditActionFilter.decision);
      expect(copy.from, DateTime(2024, 1, 1));
      expect(copy.to, DateTime(2024, 12, 31));
      expect(copy.page, 3);
      expect(copy.pageSize, 50);
    });

    test('toQueryParams with all fields', () {
      final f = ModerationAuditSearchFilters(
        contentId: 'c1',
        userId: 'u1',
        moderatorId: 'm1',
        action: ModerationAuditActionFilter.escalation,
        from: DateTime(2024, 1, 1),
        to: DateTime(2024, 6, 30),
        page: 2,
        pageSize: 10,
      );
      final params = f.toQueryParams();
      expect(params['contentId'], 'c1');
      expect(params['userId'], 'u1');
      expect(params['moderatorId'], 'm1');
      expect(params['action'], 'escalation');
      expect(params['from'], isNotNull);
      expect(params['to'], isNotNull);
      expect(params['page'], 2);
      expect(params['pageSize'], 10);
    });

    test('toQueryParams skips null/empty fields', () {
      const f = ModerationAuditSearchFilters();
      final params = f.toQueryParams();
      expect(params.containsKey('contentId'), isFalse);
      expect(params.containsKey('userId'), isFalse);
      expect(params.containsKey('moderatorId'), isFalse);
      expect(params.containsKey('action'), isFalse); // all is skipped
      expect(params['page'], 1);
      expect(params['pageSize'], 20);
    });

    test('toQueryParams skips empty contentId', () {
      const f = ModerationAuditSearchFilters(contentId: '');
      final params = f.toQueryParams();
      expect(params.containsKey('contentId'), isFalse);
    });
  });

  // ─── ModerationDecisionInput ───
  group('ModerationDecisionInput', () {
    test('toJson includes all fields', () {
      const input = ModerationDecisionInput(
        action: ModerationDecisionAction.remove,
        rationale: 'spam content',
        policyTest: true,
      );
      final json = input.toJson();
      expect(json['decision'], 'remove');
      expect(json['rationale'], 'spam content');
      expect(json['policyTest'], isTrue);
    });

    test('default policyTest is false', () {
      const input = ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'OK',
      );
      expect(input.policyTest, isFalse);
      expect(input.toJson()['policyTest'], isFalse);
    });
  });

  // ─── ModerationDecisionAction extension ───
  group('ModerationDecisionAction labels', () {
    test('all labels', () {
      expect(ModerationDecisionAction.allow.label, 'Allow');
      expect(ModerationDecisionAction.remove.label, 'Remove');
      expect(ModerationDecisionAction.warn.label, 'Warn User');
      expect(ModerationDecisionAction.ban.label, 'Ban User');
    });
  });

  // ─── ModerationEscalationInput ───
  group('ModerationEscalationInput', () {
    test('toJson', () {
      const input = ModerationEscalationInput(
        reason: 'needs expert review',
        targetQueue: 'escalated',
      );
      final json = input.toJson();
      expect(json['reason'], 'needs expert review');
      expect(json['targetQueue'], 'escalated');
    });
  });

  // ─── ModerationDecisionResult ───
  group('ModerationDecisionResult', () {
    test('fromJson success', () {
      final r = ModerationDecisionResult.fromJson({
        'success': true,
        'message': 'done',
        'caseId': 'case-1',
      });
      expect(r.success, isTrue);
      expect(r.message, 'done');
      expect(r.caseId, 'case-1');
    });

    test('fromJson failure', () {
      final r = ModerationDecisionResult.fromJson({'success': false});
      expect(r.success, isFalse);
      expect(r.message, isNull);
      expect(r.caseId, isNull);
    });
  });

  // ─── ModerationAuditEntry.fromJson ───
  group('ModerationAuditEntry.fromJson', () {
    test('parses standard fields', () {
      final entry = ModerationAuditEntry.fromJson({
        'id': 'ae1',
        'caseId': 'case-1',
        'timestamp': '2024-06-15T10:00:00Z',
        'actorId': 'user1',
        'actorRole': 'moderator',
        'action': 'flagged',
        'details': 'inappropriate content',
      });
      expect(entry.id, 'ae1');
      expect(entry.caseId, 'case-1');
      expect(entry.actorId, 'user1');
      expect(entry.actorRole, 'moderator');
      expect(entry.action, ModerationAuditActionType.flagged);
      expect(entry.details, 'inappropriate content');
    });

    test('parses alternate field names', () {
      final entry = ModerationAuditEntry.fromJson({
        'itemId': 'item-1',
        'createdAt': '2024-01-01T00:00:00Z',
        'type': 'ai_evaluated',
        'message': 'auto-moderated',
      });
      expect(entry.caseId, 'item-1');
      expect(entry.action, ModerationAuditActionType.aiEvaluated);
      expect(entry.details, 'auto-moderated');
    });

    test('handles missing/null fields gracefully', () {
      final entry = ModerationAuditEntry.fromJson({});
      expect(entry.id, '');
      expect(entry.actorId, 'system');
      expect(entry.actorRole, 'system');
      expect(entry.details, 'No details provided');
    });

    test('parses all action types', () {
      expect(
        ModerationAuditEntry.fromJson({'action': 'flag'}).action,
        ModerationAuditActionType.flagged,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'ai'}).action,
        ModerationAuditActionType.aiEvaluated,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'vote'}).action,
        ModerationAuditActionType.communityVote,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'community_vote'}).action,
        ModerationAuditActionType.communityVote,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'decision'}).action,
        ModerationAuditActionType.decision,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'moderator_decision'}).action,
        ModerationAuditActionType.decision,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'escalated'}).action,
        ModerationAuditActionType.escalation,
      );
      expect(
        ModerationAuditEntry.fromJson({'action': 'appeal'}).action,
        ModerationAuditActionType.appeal,
      );
      // default → appeal
      expect(
        ModerationAuditEntry.fromJson({'action': 'unknown'}).action,
        ModerationAuditActionType.appeal,
      );
    });
  });

  // ─── ModerationAuditPagination ───
  group('ModerationAuditPagination', () {
    test('fromJson with data', () {
      final p = ModerationAuditPagination.fromJson({
        'page': 2,
        'pageSize': 50,
        'total': 100,
        'hasMore': true,
      });
      expect(p.page, 2);
      expect(p.pageSize, 50);
      expect(p.total, 100);
      expect(p.hasMore, isTrue);
    });

    test('fromJson with null', () {
      final p = ModerationAuditPagination.fromJson(null);
      expect(p.page, 1);
      expect(p.pageSize, 20);
      expect(p.total, 0);
      expect(p.hasMore, isFalse);
    });
  });

  // ─── ModerationAuditResponse ───
  group('ModerationAuditResponse', () {
    test('fromJson with entries key', () {
      final r = ModerationAuditResponse.fromJson({
        'entries': [
          {'id': 'e1', 'action': 'flagged'},
        ],
        'pagination': {'page': 1, 'pageSize': 20, 'total': 1, 'hasMore': false},
      });
      expect(r.entries, hasLength(1));
      expect(r.pagination.page, 1);
    });

    test('fromJson with data key', () {
      final r = ModerationAuditResponse.fromJson({
        'data': [
          {'id': 'e1'},
        ],
      });
      expect(r.entries, hasLength(1));
    });

    test('fromJson with items key', () {
      final r = ModerationAuditResponse.fromJson({
        'items': [
          {'id': 'e1'},
        ],
      });
      expect(r.entries, hasLength(1));
    });

    test('fromJson with empty data', () {
      final r = ModerationAuditResponse.fromJson({});
      expect(r.entries, isEmpty);
    });
  });

  // ─── ErrorCodes ───
  group('ErrorCodes', () {
    test('all code constants defined', () {
      expect(ErrorCodes.deviceIntegrityBlocked, 'DEVICE_INTEGRITY_BLOCKED');
      expect(ErrorCodes.authRequired, 'AUTH_REQUIRED');
      expect(ErrorCodes.tokenExpired, 'TOKEN_EXPIRED');
      expect(ErrorCodes.dailyLimitExceeded, 'DAILY_LIMIT_EXCEEDED');
      expect(
        ErrorCodes.dailyAppealLimitExceeded,
        'DAILY_APPEAL_LIMIT_EXCEEDED',
      );
      expect(ErrorCodes.contentBlocked, 'CONTENT_BLOCKED');
      expect(ErrorCodes.aiContentBlocked, 'AI_CONTENT_BLOCKED');
      expect(ErrorCodes.aiLabelRequired, 'AI_LABEL_REQUIRED');
      expect(ErrorCodes.appealExists, 'APPEAL_EXISTS');
      expect(ErrorCodes.validationFailed, 'VALIDATION_FAILED');
      expect(ErrorCodes.notFound, 'NOT_FOUND');
    });
  });

  // ─── ErrorMessages ───
  group('ErrorMessages', () {
    test('forCode returns message for known codes', () {
      expect(
        ErrorMessages.forCode(ErrorCodes.authRequired),
        contains('sign in'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked),
        contains('security'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.tokenExpired),
        contains('expired'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.dailyLimitExceeded),
        contains('daily limit'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.contentBlocked),
        contains('community guidelines'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.aiContentBlocked),
        contains('AI-generated'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.notFound),
        contains('not be found'),
      );
    });

    test('forCode returns default for unknown code', () {
      expect(
        ErrorMessages.forCode('UNKNOWN_CODE'),
        contains('Something went wrong'),
      );
    });

    test('forCode returns default for null', () {
      expect(ErrorMessages.forCode(null), contains('Something went wrong'));
    });

    test('forCode handles appeal-related codes', () {
      expect(
        ErrorMessages.forCode(ErrorCodes.appealExists),
        contains('appeal'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.dailyAppealLimitExceeded),
        contains('appeal'),
      );
    });

    test('forCode handles validation and AI codes', () {
      expect(
        ErrorMessages.forCode(ErrorCodes.validationFailed),
        contains('check your input'),
      );
      expect(
        ErrorMessages.forCode(ErrorCodes.aiLabelRequired),
        contains('AI-generated'),
      );
    });
  });

  // ─── AuthFailure ───
  group('AuthFailure', () {
    test('cancelledByUser', () {
      final f = AuthFailure.cancelledByUser();
      expect(f.message, contains('Cancelled'));
      expect(f.toString(), contains('Cancelled'));
    });

    test('serverError with custom message', () {
      final f = AuthFailure.serverError('custom');
      expect(f.message, 'custom');
    });

    test('serverError with default message', () {
      final f = AuthFailure.serverError();
      expect(f.message, 'Server error');
    });

    test('invalidCredentials with custom message', () {
      final f = AuthFailure.invalidCredentials('bad pw');
      expect(f.message, 'bad pw');
    });

    test('invalidCredentials with default message', () {
      final f = AuthFailure.invalidCredentials();
      expect(f.message, 'Invalid credentials');
    });

    test('networkError with custom message', () {
      final f = AuthFailure.networkError('timeout');
      expect(f.message, 'timeout');
    });

    test('networkError with default message', () {
      final f = AuthFailure.networkError();
      expect(f.message, 'Network error');
    });

    test('platformError with custom message', () {
      final f = AuthFailure.platformError('no biometrics');
      expect(f.message, 'no biometrics');
    });

    test('platformError with default message', () {
      final f = AuthFailure.platformError();
      expect(f.message, 'Platform error');
    });
  });
}

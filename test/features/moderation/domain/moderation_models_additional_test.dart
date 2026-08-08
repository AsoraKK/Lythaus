import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';

void main() {
  test('ModerationFilters builds query params for active filters', () {
    const filters = ModerationFilters(
      itemType: ModerationItemFilter.appeal,
      severity: ModerationSeverityFilter.high,
      age: ModerationAgeFilter.underDay,
      queue: ModerationQueueFilter.policyTest,
    );

    final params = filters.toQueryParams();
    expect(params['type'], 'appeal');
    expect(params['severity'], 'high');
    expect(params['age'], '24h');
    expect(params['queue'], 'policy-test');
  });

  test('ModerationAuditSearchFilters includes only non-empty fields', () {
    final filters = ModerationAuditSearchFilters(
      contentId: 'content-1',
      userId: 'user-1',
      moderatorId: 'mod-1',
      action: ModerationAuditActionFilter.decision,
      from: DateTime(2024, 1, 1),
      to: DateTime(2024, 1, 2),
      page: 2,
      pageSize: 50,
    );

    final params = filters.toQueryParams();
    expect(params['contentId'], 'content-1');
    expect(params['userId'], 'user-1');
    expect(params['moderatorId'], 'mod-1');
    expect(params['action'], 'decision');
    expect(params['page'], 2);
    expect(params['pageSize'], 50);
    expect(params['from'], '2024-01-01T00:00:00.000');
    expect(params['to'], '2024-01-02T00:00:00.000');
  });

  test('ModerationQueueItem parses fallback fields and defaults', () {
    final item = ModerationQueueItem.fromJson({
      'caseId': 'case-1',
      'type': 'unknown',
      'contentId': 'content-1',
      'contentType': 'post',
      'snippet': 'preview',
      'createdAt': 'invalid-date',
      'severity': 'invalid',
      'status': 'open',
      'queue': 'default',
      'flags': 4,
      'appealVotes': 2,
      'escalated': true,
      'aiLabel': 'high',
      'isPolicyTest': true,
    });

    expect(item.id, 'case-1');
    expect(item.type, ModerationItemType.flag);
    expect(item.severity, ModerationSeverityLevel.unknown);
    expect(item.reportCount, 4);
    expect(item.communityVotes, 2);
    expect(item.isEscalated, true);
    expect(item.isPolicyTest, true);
  });

  test('ModerationQueueResponse parses data list payloads', () {
    final response = ModerationQueueResponse.fromJson({
      'data': [
        {
          'id': 'case-2',
          'type': 'appeal',
          'contentId': 'content-2',
          'contentType': 'post',
          'contentPreview': 'preview',
          'createdAt': '2024-01-01T00:00:00Z',
          'severity': 'low',
          'status': 'open',
          'queue': 'default',
          'reportCount': 1,
          'communityVotes': 0,
          'isEscalated': false,
        },
      ],
      'pagination': {'page': 2, 'pageSize': 10, 'total': 1, 'hasMore': false},
    });

    expect(response.items, hasLength(1));
    expect(response.pagination.page, 2);
  });

  test('ModerationCase parses alternate JSON fields', () {
    final caseDetail = ModerationCase.fromJson({
      'caseId': 'case-3',
      'type': 'appeal',
      'contentId': 'content-3',
      'contentType': 'post',
      'text': 'content body',
      'status': 'open',
      'queue': 'default',
      'severity': 'medium',
      'createdAt': 'invalid',
      'updated_at': 'invalid',
      'reports': [
        {'reason': 'spam', 'count': 1},
      ],
      'aiSummary': ['signal-1'],
      'timeline': [
        {
          'id': 'audit-1',
          'caseId': 'case-3',
          'timestamp': '2024-01-01T00:00:00Z',
          'actorId': 'mod-1',
          'actorRole': 'moderator',
          'action': 'decision',
          'details': 'approved',
        },
      ],
      'decisionHistory': [
        {
          'action': 'allow',
          'actor': 'mod-1',
          'timestamp': '2024-01-01T00:00:00Z',
          'rationale': 'ok',
        },
      ],
      'escalation': {
        'targetQueue': 'Policy QA',
        'reason': 'needs review',
        'timestamp': '2024-01-02T00:00:00Z',
      },
      'appeal': {
        'appealId': 'appeal-1',
        'userStatement': 'please review',
        'overturnVotes': 1,
        'upholdVotes': 2,
      },
    });

    expect(caseDetail.contentText, 'content body');
    expect(caseDetail.auditTrail, hasLength(1));
    expect(caseDetail.decisionHistory, hasLength(1));
    expect(caseDetail.escalation?.targetQueue, 'Policy QA');
    expect(caseDetail.appealDetails?.appealId, 'appeal-1');
  });
}

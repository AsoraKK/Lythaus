import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ModerationAuditEntry', () {
    test('fromJson parses all fields correctly', () {
      final json = <String, dynamic>{
        'id': 'audit-123',
        'timestamp': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'action': 'decision',
        'actorId': 'mod-456',
        'actorRole': 'moderator',
        'details': 'Approved content',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.id, 'audit-123');
      expect(entry.timestamp, DateTime.parse('2024-01-15T10:30:00.000Z'));
      expect(entry.caseId, 'case-123');
      expect(entry.action, ModerationAuditActionType.decision);
      expect(entry.actorId, 'mod-456');
      expect(entry.actorRole, 'moderator');
      expect(entry.details, 'Approved content');
    });

    test('fromJson handles legacy createdAt field', () {
      final json = <String, dynamic>{
        'createdAt': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'action': 'flagged',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.timestamp, DateTime.parse('2024-01-15T10:30:00.000Z'));
    });

    test('fromJson handles legacy itemId field', () {
      final json = <String, dynamic>{
        'timestamp': '2024-01-15T10:30:00.000Z',
        'itemId': 'item-789',
        'action': 'escalation',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.caseId, 'item-789');
    });

    test('fromJson handles legacy type field', () {
      final json = <String, dynamic>{
        'timestamp': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'type': 'appeal',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.action, ModerationAuditActionType.appeal);
    });

    test('fromJson handles missing optional fields with defaults', () {
      final json = <String, dynamic>{
        'timestamp': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'action': 'decision',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.id, '');
      expect(entry.actorId, 'system');
      expect(entry.actorRole, 'system');
      expect(entry.details, 'No details provided');
    });

    test('_parseAction converts all action strings correctly', () {
      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-1',
          'action': 'flagged',
        }).action,
        ModerationAuditActionType.flagged,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-2',
          'action': 'flag',
        }).action,
        ModerationAuditActionType.flagged,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-3',
          'action': 'ai_evaluated',
        }).action,
        ModerationAuditActionType.aiEvaluated,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-4',
          'action': 'ai',
        }).action,
        ModerationAuditActionType.aiEvaluated,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-5',
          'action': 'community_vote',
        }).action,
        ModerationAuditActionType.communityVote,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-6',
          'action': 'vote',
        }).action,
        ModerationAuditActionType.communityVote,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-7',
          'action': 'decision',
        }).action,
        ModerationAuditActionType.decision,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-8',
          'action': 'moderator_decision',
        }).action,
        ModerationAuditActionType.decision,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-9',
          'action': 'escalated',
        }).action,
        ModerationAuditActionType.escalation,
      );

      expect(
        ModerationAuditEntry.fromJson({
          'timestamp': '2024-01-15T10:30:00.000Z',
          'caseId': 'case-10',
          'action': 'appeal',
        }).action,
        ModerationAuditActionType.appeal,
      );
    });

    test('_parseAction handles unknown action type defaults to appeal', () {
      final json = <String, dynamic>{
        'timestamp': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'action': 'unknown_action',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.action, ModerationAuditActionType.appeal);
    });

    test('fromJson handles legacy message field for details', () {
      final json = <String, dynamic>{
        'timestamp': '2024-01-15T10:30:00.000Z',
        'caseId': 'case-123',
        'action': 'decision',
        'message': 'Legacy message field',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      expect(entry.details, 'Legacy message field');
    });

    test('fromJson handles invalid date gracefully', () {
      final json = <String, dynamic>{
        'timestamp': 'invalid-date',
        'caseId': 'case-123',
        'action': 'decision',
      };

      final entry = ModerationAuditEntry.fromJson(json);

      // Should default to current time, so just verify it's a valid DateTime
      expect(entry.timestamp, isA<DateTime>());
    });
  });

  group('ModerationAuditPagination', () {
    test('fromJson parses all fields correctly', () {
      final json = <String, dynamic>{
        'total': 150,
        'page': 3,
        'pageSize': 25,
        'hasMore': true,
      };

      final pagination = ModerationAuditPagination.fromJson(json);

      expect(pagination.total, 150);
      expect(pagination.page, 3);
      expect(pagination.pageSize, 25);
      expect(pagination.hasMore, true);
    });

    test('fromJson handles null input', () {
      final pagination = ModerationAuditPagination.fromJson(null);

      expect(pagination.total, 0);
      expect(pagination.page, 1);
      expect(pagination.pageSize, 20);
      expect(pagination.hasMore, false);
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{'total': 100};

      final pagination = ModerationAuditPagination.fromJson(json);

      expect(pagination.total, 100);
      expect(pagination.page, 1);
      expect(pagination.pageSize, 20);
      expect(pagination.hasMore, false);
    });

    test('fromJson handles boolean conversion for hasMore', () {
      final json1 = <String, dynamic>{'total': 50, 'hasMore': true};
      expect(ModerationAuditPagination.fromJson(json1).hasMore, true);

      final json2 = <String, dynamic>{'total': 50, 'hasMore': false};
      expect(ModerationAuditPagination.fromJson(json2).hasMore, false);
    });
  });

  group('ModerationAuditResponse', () {
    test('fromJson parses all fields correctly', () {
      final json = <String, dynamic>{
        'entries': [
          {
            'timestamp': '2024-01-15T10:30:00.000Z',
            'caseId': 'case-1',
            'action': 'flagged',
          },
          {
            'timestamp': '2024-01-15T11:30:00.000Z',
            'caseId': 'case-2',
            'action': 'decision',
          },
        ],
        'pagination': {'total': 50, 'page': 2, 'pageSize': 10, 'hasMore': true},
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, hasLength(2));
      expect(response.entries[0].caseId, 'case-1');
      expect(response.entries[1].caseId, 'case-2');
      expect(response.pagination.total, 50);
      expect(response.pagination.page, 2);
    });

    test('fromJson handles legacy data field', () {
      final json = <String, dynamic>{
        'data': [
          {
            'timestamp': '2024-01-15T10:30:00.000Z',
            'caseId': 'case-1',
            'action': 'flagged',
          },
        ],
        'pagination': {'total': 10},
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, hasLength(1));
      expect(response.entries[0].caseId, 'case-1');
    });

    test('fromJson handles legacy items field', () {
      final json = <String, dynamic>{
        'items': [
          {
            'timestamp': '2024-01-15T10:30:00.000Z',
            'caseId': 'case-1',
            'action': 'appeal',
          },
        ],
        'pagination': {'total': 10},
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, hasLength(1));
      expect(response.entries[0].caseId, 'case-1');
    });

    test('fromJson handles empty entries list', () {
      final json = <String, dynamic>{
        'entries': <Map<String, dynamic>>[],
        'pagination': {'total': 0},
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, isEmpty);
    });

    test('fromJson handles missing entries field', () {
      final json = <String, dynamic>{
        'pagination': {'total': 0},
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, isEmpty);
    });

    test('fromJson handles null pagination', () {
      final json = <String, dynamic>{
        'entries': [
          {
            'timestamp': '2024-01-15T10:30:00.000Z',
            'caseId': 'case-1',
            'action': 'flagged',
          },
        ],
      };

      final response = ModerationAuditResponse.fromJson(json);

      expect(response.entries, hasLength(1));
      expect(response.pagination.total, 0);
      expect(response.pagination.page, 1);
    });
  });

  group('ModerationAuditActionType enum', () {
    test('has all expected values', () {
      expect(ModerationAuditActionType.values, hasLength(6));
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.flagged),
      );
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.aiEvaluated),
      );
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.communityVote),
      );
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.decision),
      );
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.escalation),
      );
      expect(
        ModerationAuditActionType.values,
        contains(ModerationAuditActionType.appeal),
      );
    });
  });
}

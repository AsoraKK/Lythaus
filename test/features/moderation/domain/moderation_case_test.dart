import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';

void main() {
  group('ModerationCase', () {
    test('fromJson with complete data', () {
      final json = {
        'id': 'case-123',
        'type': 'post',
        'contentId': 'post-456',
        'contentType': 'post',
        'contentTitle': 'My Post Title',
        'contentText': 'Content of the post',
        'status': 'open',
        'queue': 'default',
        'severity': 'high',
        'createdAt': '2024-01-01T10:00:00.000Z',
        'updatedAt': '2024-01-02T12:00:00.000Z',
        'reports': [
          {
            'reason': 'spam',
            'count': 5,
            'examples': ['example1', 'example2'],
          },
        ],
        'aiSignals': ['hate-speech', 'profanity'],
        'auditTrail': [
          {
            'id': 'audit-1',
            'caseId': 'case-123',
            'timestamp': '2024-01-01T10:05:00.000Z',
            'actorId': 'mod-1',
            'actorRole': 'moderator',
            'action': 'decision',
            'details': 'Reviewed content',
          },
        ],
        'decisionHistory': [
          {
            'action': 'allow',
            'actor': 'mod-1',
            'timestamp': '2024-01-01T10:10:00.000Z',
            'rationale': 'No violation found',
          },
        ],
        'mediaUrl': 'https://example.com/media.jpg',
        'authorHandle': '@testuser',
        'escalation': {
          'targetQueue': 'Policy QA',
          'reason': 'Needs policy review',
          'escalatedAt': '2024-01-03T08:00:00.000Z',
        },
        'appeal': {
          'appealId': 'appeal-789',
          'appealText': 'I think this is incorrect',
          'overturnVotes': 3,
          'upholdVotes': 1,
        },
      };

      final moderationCase = ModerationCase.fromJson(json);

      expect(moderationCase.id, 'case-123');
      expect(moderationCase.type, ModerationItemType.flag);
      expect(moderationCase.contentId, 'post-456');
      expect(moderationCase.contentType, 'post');
      expect(moderationCase.contentTitle, 'My Post Title');
      expect(moderationCase.contentText, 'Content of the post');
      expect(moderationCase.status, 'open');
      expect(moderationCase.queue, 'default');
      expect(moderationCase.severity, ModerationSeverityLevel.high);
      expect(
        moderationCase.createdAt.toIso8601String(),
        startsWith('2024-01-01T10:00:00'),
      );
      expect(
        moderationCase.updatedAt.toIso8601String(),
        startsWith('2024-01-02T12:00:00'),
      );
      expect(moderationCase.reports, hasLength(1));
      expect(moderationCase.aiSignals, ['hate-speech', 'profanity']);
      expect(moderationCase.auditTrail, hasLength(1));
      expect(moderationCase.decisionHistory, hasLength(1));
      expect(moderationCase.mediaUrl, 'https://example.com/media.jpg');
      expect(moderationCase.authorHandle, '@testuser');
      expect(moderationCase.escalation, isNotNull);
      expect(moderationCase.appealDetails, isNotNull);
    });

    test('fromJson with legacy field names for createdAt/updatedAt', () {
      final json = {
        'caseId': 'case-old',
        'type': 'comment',
        'contentId': 'comment-1',
        'contentType': 'comment',
        'created_at': '2024-02-01T10:00:00.000Z',
        'updated_at': '2024-02-02T10:00:00.000Z',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);

      expect(moderationCase.id, 'case-old');
      expect(
        moderationCase.createdAt.toIso8601String(),
        startsWith('2024-02-01T10:00:00'),
      );
      expect(
        moderationCase.updatedAt.toIso8601String(),
        startsWith('2024-02-02T10:00:00'),
      );
    });

    test('fromJson with targetId fallback for id', () {
      final json = {
        'targetId': 'target-123',
        'type': 'appeal', // Use appeal type
        'contentId': 'user-profile',
        'contentType': 'profile',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);

      expect(moderationCase.id, 'target-123');
      expect(moderationCase.type, ModerationItemType.appeal);
    });

    test('fromJson with alternative contentText fields (text, body)', () {
      final jsonWithText = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'text': 'Using text field',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final caseWithText = ModerationCase.fromJson(jsonWithText);
      expect(caseWithText.contentText, 'Using text field');

      final jsonWithBody = {
        'id': 'case-2',
        'type': 'post',
        'contentId': 'post-2',
        'contentType': 'post',
        'body': 'Using body field',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final caseWithBody = ModerationCase.fromJson(jsonWithBody);
      expect(caseWithBody.contentText, 'Using body field');
    });

    test('fromJson with alternative auditTrail field names', () {
      final jsonWithAudit = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'audit': [
          {
            'id': 'audit-1',
            'caseId': 'case-1',
            'timestamp': '2024-01-01T10:00:00.000Z',
            'actorId': 'mod-1',
            'actorRole': 'moderator',
            'action': 'decision',
            'details': 'Test audit',
          },
        ],
        'decisionHistory': <dynamic>[],
      };

      final caseWithAudit = ModerationCase.fromJson(jsonWithAudit);
      expect(caseWithAudit.auditTrail, hasLength(1));

      final jsonWithTimeline = {
        'id': 'case-2',
        'type': 'post',
        'contentId': 'post-2',
        'contentType': 'post',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'timeline': [
          {
            'id': 'audit-2',
            'caseId': 'case-2',
            'timestamp': '2024-01-01T11:00:00.000Z',
            'actorId': 'mod-2',
            'actorRole': 'admin',
            'action': 'escalated',
            'details': 'Test timeline',
          },
        ],
        'decisionHistory': <dynamic>[],
      };

      final caseWithTimeline = ModerationCase.fromJson(jsonWithTimeline);
      expect(caseWithTimeline.auditTrail, hasLength(1));
    });

    test('fromJson with alternative aiSignals field (aiSummary)', () {
      final json = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'reports': <dynamic>[],
        'aiSummary': ['signal1', 'signal2'],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);
      expect(moderationCase.aiSignals, ['signal1', 'signal2']);
    });

    test('fromJson filters out empty aiSignals', () {
      final json = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'reports': <dynamic>[],
        'aiSignals': ['valid', '', null, 'another'],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);
      expect(moderationCase.aiSignals, ['valid', 'another']);
    });

    test('fromJson handles missing optional fields with defaults', () {
      final minimalJson = {
        'contentId': 'content-1',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(minimalJson);

      expect(moderationCase.id, '');
      expect(moderationCase.type, ModerationItemType.flag);
      expect(moderationCase.contentType, 'post');
      expect(moderationCase.contentText, '');
      expect(moderationCase.status, 'open');
      expect(moderationCase.queue, 'default');
      expect(
        moderationCase.severity,
        ModerationSeverityLevel.unknown,
      ); // Default is unknown
      expect(moderationCase.contentTitle, isNull);
      expect(moderationCase.mediaUrl, isNull);
      expect(moderationCase.authorHandle, isNull);
      expect(moderationCase.escalation, isNull);
      expect(moderationCase.appealDetails, isNull);
    });

    test('fromJson handles invalid date strings with fallback', () {
      final json = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'createdAt': 'invalid-date',
        'updatedAt': 'also-invalid',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);

      expect(moderationCase.createdAt, isA<DateTime>());
      expect(moderationCase.updatedAt, isA<DateTime>());
    });

    test('fromJson uses createdAt for updatedAt fallback when missing', () {
      final json = {
        'id': 'case-1',
        'type': 'post',
        'contentId': 'post-1',
        'contentType': 'post',
        'createdAt': '2024-01-01T10:00:00.000Z',
        'reports': <dynamic>[],
        'aiSignals': <dynamic>[],
        'auditTrail': <dynamic>[],
        'decisionHistory': <dynamic>[],
      };

      final moderationCase = ModerationCase.fromJson(json);

      expect(moderationCase.updatedAt, equals(moderationCase.createdAt));
    });
  });

  group('ModerationReport', () {
    test('fromJson with complete data', () {
      final json = {
        'reason': 'spam',
        'count': 5,
        'examples': ['example1', 'example2', 'example3'],
      };

      final report = ModerationReport.fromJson(json);

      expect(report.reason, 'spam');
      expect(report.count, 5);
      expect(report.examples, ['example1', 'example2', 'example3']);
    });

    test('fromJson with legacy reasonCount field', () {
      final json = {'reason': 'harassment', 'reasonCount': 10};

      final report = ModerationReport.fromJson(json);

      expect(report.reason, 'harassment');
      expect(report.count, 10);
      expect(report.examples, isEmpty);
    });

    test('fromJson with missing fields uses defaults', () {
      final json = <String, dynamic>{};

      final report = ModerationReport.fromJson(json);

      expect(report.reason, 'Unknown');
      expect(report.count, 0);
      expect(report.examples, isEmpty);
    });

    test('fromJson filters out empty examples', () {
      final json = {
        'reason': 'spam',
        'count': 3,
        'examples': ['valid', '', null, 'another'],
      };

      final report = ModerationReport.fromJson(json);

      expect(report.examples, ['valid', 'another']);
    });
  });

  group('ModerationAppealDetails', () {
    test('fromJson with complete data', () {
      final json = {
        'appealId': 'appeal-123',
        'appealText': 'User statement here',
        'overturnVotes': 5,
        'upholdVotes': 2,
      };

      final details = ModerationAppealDetails.fromJson(json);

      expect(details.appealId, 'appeal-123');
      expect(details.summary, 'User statement here');
      expect(details.overturnVotes, 5);
      expect(details.upholdVotes, 2);
    });

    test('fromJson with userStatement fallback for summary', () {
      final json = {
        'appealId': 'appeal-456',
        'userStatement': 'Alternative field for statement',
        'overturnVotes': 3,
        'upholdVotes': 1,
      };

      final details = ModerationAppealDetails.fromJson(json);

      expect(details.summary, 'Alternative field for statement');
    });

    test('fromJson with missing fields uses defaults', () {
      final json = <String, dynamic>{};

      final details = ModerationAppealDetails.fromJson(json);

      expect(details.appealId, '');
      expect(details.summary, '');
      expect(details.overturnVotes, 0);
      expect(details.upholdVotes, 0);
    });
  });

  group('ModerationEscalationInfo', () {
    test('fromJson with complete data', () {
      final json = {
        'targetQueue': 'Policy QA',
        'reason': 'Needs policy review',
        'escalatedAt': '2024-01-05T14:30:00.000Z',
      };

      final escalation = ModerationEscalationInfo.fromJson(json);

      expect(escalation.targetQueue, 'Policy QA');
      expect(escalation.reason, 'Needs policy review');
      expect(
        escalation.escalatedAt.toIso8601String(),
        startsWith('2024-01-05T14:30:00'),
      );
    });

    test('fromJson with timestamp fallback for escalatedAt', () {
      final json = {
        'targetQueue': 'Senior Mod',
        'reason': 'Complex case',
        'timestamp': '2024-02-10T09:00:00.000Z',
      };

      final escalation = ModerationEscalationInfo.fromJson(json);

      expect(
        escalation.escalatedAt.toIso8601String(),
        startsWith('2024-02-10T09:00:00'),
      );
    });

    test('fromJson with invalid date uses fallback', () {
      final json = {
        'targetQueue': 'Queue',
        'reason': 'Reason',
        'escalatedAt': 'invalid-date',
      };

      final escalation = ModerationEscalationInfo.fromJson(json);

      expect(escalation.escalatedAt, isA<DateTime>());
    });

    test('fromJson with missing fields uses defaults', () {
      final json = <String, dynamic>{};

      final escalation = ModerationEscalationInfo.fromJson(json);

      expect(escalation.targetQueue, 'Escalated');
      expect(escalation.reason, 'Escalated for review');
      expect(escalation.escalatedAt, isA<DateTime>());
    });
  });

  group('ModerationDecisionHistory', () {
    test('fromJson with complete data', () {
      final json = {
        'action': 'allow',
        'actor': 'mod-123',
        'timestamp': '2024-01-10T16:00:00.000Z',
        'rationale': 'Content is acceptable',
      };

      final history = ModerationDecisionHistory.fromJson(json);

      expect(history.action, 'allow');
      expect(history.actor, 'mod-123');
      expect(
        history.timestamp.toIso8601String(),
        startsWith('2024-01-10T16:00:00'),
      );
      expect(history.rationale, 'Content is acceptable');
    });

    test('fromJson with createdAt fallback for timestamp', () {
      final json = {
        'action': 'remove',
        'actor': 'mod-456',
        'createdAt': '2024-03-01T12:00:00.000Z',
        'rationale': 'Violates guidelines',
      };

      final history = ModerationDecisionHistory.fromJson(json);

      expect(
        history.timestamp.toIso8601String(),
        startsWith('2024-03-01T12:00:00'),
      );
    });

    test('fromJson with invalid timestamp uses fallback', () {
      final json = {
        'action': 'warn',
        'actor': 'mod-789',
        'timestamp': 'not-a-date',
        'rationale': 'Warning issued',
      };

      final history = ModerationDecisionHistory.fromJson(json);

      expect(history.timestamp, isA<DateTime>());
    });

    test('fromJson with missing fields uses defaults', () {
      final json = <String, dynamic>{};

      final history = ModerationDecisionHistory.fromJson(json);

      expect(history.action, 'Decision');
      expect(history.actor, 'Moderator');
      expect(history.timestamp, isA<DateTime>());
      expect(history.rationale, 'No rationale provided');
    });
  });
}

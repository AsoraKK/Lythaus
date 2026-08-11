import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  test('reputation state preserves backend-issued labels and blockers', () {
    final state = ReputationState.fromJson({
      'userId': 'user-1',
      'level': 4,
      'reputationLevel': 4,
      'levelName': 'Credible',
      'reputationStatus': 'active',
      'reputationBand': 'established',
      'policyVersion': '2026-08',
      'pillars': {
        'accountability': 1,
        'contribution': 2,
        'conduct': 3,
        'sourcing': 4,
        'authenticity': 5,
        'reviewReliability': 6,
      },
      'promotionBlockers': [
        'review_pending',
        {'untrusted': 'raw-json'},
      ],
      'evaluatedAt': '2026-08-10T10:00:00Z',
    });

    expect(state.level, 4);
    expect(state.levelName, 'Credible');
    expect(state.pillars['conduct'], 3);
    expect(state.promotionBlockers, ['review_pending']);
  });

  test('ledger and activity parse private server records', () {
    final ledger = LedgerEntry.fromJson({
      'id': 'ledger-1',
      'eventType': 'post_published',
      'pillar': 'contribution',
      'impact': '2',
      'status': 'active',
      'explanationCode': 'contribution_recorded',
      'policyVersion': '2026-08',
      'createdAt': '2026-08-10T10:00:00Z',
      'appealId': 'appeal-1',
    });
    final activity = ActivityEntry.fromJson({
      'id': 'activity-1',
      'category': 'appeals',
      'source': 'system',
      'title': 'Appeal opened',
      'explanation': 'A moderation case opened an appeal.',
      'result': 'pending',
      'reasonCode': 'appeal_opened',
      'policyVersion': '2026-08',
      'objectType': 'appeal',
      'reputationEffect': 'none',
      'appealable': false,
      'retentionClass': 'ordinary',
      'retentionDays': 730,
      'createdAt': '2026-08-10T10:00:00Z',
    });

    expect(ledger.appealId, 'appeal-1');
    expect(activity.title, 'Appeal opened');
  });

  test(
    'private reputation and activity records fail closed on malformed data',
    () {
      expect(
        () => ReputationState.fromJson({
          'userId': 'user-1',
          'level': 4,
          'reputationLevel': 4,
          'levelName': 'Credible',
          'reputationStatus': {'untrusted': 'active'},
          'reputationBand': 'established',
          'policyVersion': '2026-08',
          'pillars': {
            'accountability': 1,
            'contribution': 2,
            'conduct': 3,
            'sourcing': 4,
            'authenticity': 5,
            'reviewReliability': 6,
          },
          'promotionBlockers': <String>[],
          'evaluatedAt': null,
        }),
        throwsFormatException,
      );
      expect(
        () => ActivityEntry.fromJson({
          'id': 'activity-1',
          'category': 'moderation',
          'source': 'system',
          'title': {'untrusted': 'raw-json'},
          'explanation': 'A decision is available.',
          'result': 'succeeded',
          'policyVersion': 'activity-v1.0.0',
          'reputationEffect': 'withheld',
          'appealable': true,
          'retentionClass': 'moderation',
          'retentionDays': 90,
          'createdAt': '2026-08-11T10:00:00Z',
        }),
        throwsFormatException,
      );
    },
  );

  test(
    'optional activity fields drop nested values rather than displaying them',
    () {
      final entry = ActivityEntry.fromJson({
        'id': 'activity-1',
        'category': 'moderation',
        'source': 'system',
        'title': 'Moderation case resolved',
        'explanation': 'A decision is available.',
        'result': 'succeeded',
        'reasonCode': {'untrusted': 'raw-json'},
        'policyVersion': 'activity-v1.0.0',
        'objectType': ['not', 'a', 'string'],
        'objectId': {'id': 'untrusted'},
        'reputationEffect': 'withheld',
        'appealable': true,
        'retentionClass': 'moderation',
        'retentionDays': 90,
        'createdAt': '2026-08-11T10:00:00Z',
      });

      expect(entry.reasonCode, isNull);
      expect(entry.objectType, isNull);
      expect(entry.objectId, isNull);
    },
  );

  test('activity category queries preserve the API category vocabulary', () {
    expect(ActivityCategory.values, hasLength(9));
    expect(ActivityCategory.all.queryValue, isNull);
    expect(ActivityCategory.moderation.queryValue, 'moderation');
    expect(ActivityCategory.fromValue('PRIVACY'), ActivityCategory.privacy);
    expect(ActivityCategory.fromValue('all'), isNull);

    const query = ActivityPageQuery(
      cursor: 'opaque-cursor',
      category: ActivityCategory.content,
    );
    expect(query.cursor, 'opaque-cursor');
    expect(query.category, ActivityCategory.content);
  });
}

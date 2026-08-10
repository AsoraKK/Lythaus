import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  test('reputation state preserves backend-issued labels and blockers', () {
    final state = ReputationState.fromJson({
      'userId': 'user-1',
      'level': 4,
      'levelName': 'Credible',
      'reputationStatus': 'active',
      'reputationBand': 'strong',
      'policyVersion': '2026-08',
      'pillars': {'conduct': 'good'},
      'promotionBlockers': ['review_pending'],
      'evaluatedAt': '2026-08-10T10:00:00Z',
    });

    expect(state.level, 4);
    expect(state.levelName, 'Credible');
    expect(state.pillars['conduct'], 'good');
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
      'title': 'Appeal opened',
      'explanation': 'A moderation case opened an appeal.',
      'result': 'open',
      'reasonCode': 'appeal_opened',
      'policyVersion': '2026-08',
      'objectType': 'appeal',
      'appealable': false,
      'createdAt': '2026-08-10T10:00:00Z',
    });

    expect(ledger.appealId, 'appeal-1');
    expect(activity.title, 'Appeal opened');
  });
}

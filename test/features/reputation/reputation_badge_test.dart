import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  test('reputation state does not need a local XP value', () {
    const state = ReputationState(
      userId: 'user-1',
      level: 2,
      levelName: 'Trusted',
      reputationStatus: 'active',
      reputationBand: 'earned',
      policyVersion: '2026-08',
      pillars: {},
      promotionBlockers: [],
    );

    expect(state.levelName, 'Trusted');
  });
}

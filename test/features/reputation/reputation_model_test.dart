import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  test('server response can carry a non-threshold reputation level', () {
    final state = ReputationState.fromJson({
      'level': 17,
      'levelName': 'Editorial contributor',
      'reputationBand': 'earned',
      'reputationStatus': 'active',
      'policyVersion': '2026-08',
    });

    expect(state.level, 17);
    expect(state.levelName, 'Editorial contributor');
  });
}

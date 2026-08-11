import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  test('server response carries a validated L0-L5 reputation level', () {
    final state = ReputationState.fromJson({
      'userId': '018f5d33-9a7b-7def-8123-456789abcdef',
      'level': 5,
      'reputationLevel': 5,
      'levelName': 'Highly Trusted Contributor',
      'reputationBand': 'established',
      'reputationStatus': 'active',
      'policyVersion': 'reputation-v2.0.0',
      'pillars': {
        'accountability': 80,
        'contribution': 80,
        'conduct': 90,
        'sourcing': 55,
        'authenticity': 85,
        'reviewReliability': 50,
      },
      'promotionBlockers': <String>[],
    });

    expect(state.level, 5);
    expect(state.levelName, 'Highly Trusted Contributor');
  });
}

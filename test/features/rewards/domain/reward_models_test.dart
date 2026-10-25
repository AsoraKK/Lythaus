import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

Map<String, dynamic> _monthlyResponse({
  String snapshotState = 'confirmed',
  String selectionState = 'ready',
}) => {
  'state': selectionState == 'ready' ? 'ready' : 'pending',
  'reasonCode': selectionState == 'ready' ? null : 'selection_unavailable',
  'effectiveMonth': '2026-10',
  'currentLevel': 1,
  'sourceMonth': '2026-09',
  'sourceScore': 500,
  'snapshot': <String, dynamic>{
    'state': snapshotState,
    'reasonCode': 'source_month_assessed',
    'effectiveMonth': '2026-10',
    'sourceMonth': '2026-09',
    'sourceScore': 500,
    'level': 1,
    'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
  },
  'selection': {
    'state': selectionState,
    'reasonCode': selectionState == 'ready' ? null : 'selection_unavailable',
  },
};

Map<String, dynamic> _preparedMonthlyResponse() => {
  'responseVersion': 'monthly-rewards-response-v2-preparation',
  'responseKind': 'monthly_rewards',
  'policyVersion': 'lythaus-monthly-rewards-2026-10-v2',
  'catalogueHash':
      '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67',
  'dataVersion': 2,
  'preparationOnly': true,
  'runtimeActivationAllowed': false,
  'appliedPoints': 0,
  'maximumSourceMonth': 13650,
  'state': 'pending',
  'reasonCode': 'activation_not_approved',
  'effectiveMonth': '2027-01',
  'currentLevel': null,
  'sourceMonth': null,
  'sourceScore': null,
  'snapshot': {'state': 'unavailable'},
  'selection': {'state': 'unavailable'},
  'snapshotProjection': {
    'state': 'shadow',
    'reasonCode': 'source_month_assessed',
    'effectiveMonth': '2027-01',
    'sourceMonth': '2026-12',
    'sourceScore': 13650,
    'level': 5,
  },
};

void main() {
  test(
    'provisional monthly candidate remains visible without claim authority',
    () {
      final payload = <String, dynamic>{
        'state': 'pending',
        'prospective': <String, dynamic>{
          'policyVersion': 'lythaus-monthly-rewards-v0.5-candidate',
          'state': 'provisional',
          'sourceMonth': '2026-11',
          'effectiveMonth': '2026-12',
          'sourceScore': 1250,
          'level': 2,
          'finalMaximumSourceMonth': null,
          'maximumForCurrentComponents': 13650,
          'redeemable': false,
          'runtimeActivationAllowed': false,
          'appliedPoints': 0,
        },
      };
      final view = MonthlyRewardsView.fromJson(payload);
      expect(view.prospective?.sourceScore, 1250);
      expect(view.prospective?.level, 2);
      expect(view.hasConfirmedLevel, isFalse);
      expect(view.rewardsReady, isFalse);
      for (final patch in [
        {'redeemable': true},
        {'state': 'confirmed'},
        {'sourceScore': 13651},
        {'level': 5},
        {'effectiveMonth': '2026-11'},
        {'runtimeActivationAllowed': true},
      ]) {
        expect(
          MonthlyRewardsView.fromJson({
            ...payload,
            'prospective': {...payload['prospective'] as Map, ...patch},
          }).prospective,
          isNull,
        );
      }
    },
  );

  Map<String, dynamic> receipt(String status) => {
    'id': 'redemption-1',
    'userId': 'account-1',
    'rewardId': 'level-1-learning',
    'rewardLevel': 1,
    'rewardTitle': 'Learning access',
    'redeemedAt': '2026-05-26T01:02:03.000Z',
    'status': status,
  };

  test('confirmed wire receipt preserves the authoritative timestamp', () {
    final redemption = RewardRedemption.fromJson(receipt('redeemed'));
    expect(redemption.redeemedAt, DateTime.utc(2026, 5, 26, 1, 2, 3));
    expect(redemption.status, 'redeemed');
  });

  test('revoked history never becomes successful redemption', () {
    final redemption = RewardRedemption.fromJson(receipt('revoked'));
    expect(redemption.status, 'revoked');
  });

  test(
    'missing or malformed receipt data cannot invent success or local time',
    () {
      for (final payload in [
        receipt('redeemed')..remove('redeemedAt'),
        receipt('redeemed')..['redeemedAt'] = 'not-a-time',
        receipt('redeemed')..remove('status'),
        receipt('confirmed'),
        receipt('pending'),
      ]) {
        expect(() => RewardRedemption.fromJson(payload), throwsFormatException);
      }
    },
  );

  group('monthly level authority', () {
    test(
      'confirmed snapshot remains distinct from pending reward selection',
      () {
        final view = MonthlyRewardsView.fromJson(
          _monthlyResponse(selectionState: 'pending'),
        );
        expect(view.hasConfirmedLevel, isTrue);
        expect(view.snapshot.isShadow, isFalse);
        expect(view.selectionState, 'pending');
        expect(view.selectionReasonCode, 'selection_unavailable');
        expect(view.rewardsReady, isFalse);
        expect(view.snapshot.maximumSourceMonth, 13500);
      },
    );

    test(
      'reward readiness requires both confirmed level and ready selection',
      () {
        expect(
          MonthlyRewardsView.fromJson(_monthlyResponse()).rewardsReady,
          isTrue,
        );
        final payload = _monthlyResponse()..['currentLevel'] = 2;
        final view = MonthlyRewardsView.fromJson(payload);
        expect(view.hasConfirmedLevel, isFalse);
        expect(view.rewardsReady, isFalse);
      },
    );

    test('pending unassessed Level 1 is never a confirmed or shadow level', () {
      final payload = _monthlyResponse(snapshotState: 'pending');
      (payload['snapshot'] as Map<String, dynamic>).addAll({
        'reasonCode': 'no_previous_assessment',
        'levelKind': 'unassessed_default',
        'sourceMonth': null,
        'sourceScore': null,
      });
      final view = MonthlyRewardsView.fromJson(payload);
      expect(view.hasConfirmedLevel, isFalse);
      expect(view.snapshot.isAssessed, isFalse);
      expect(view.snapshot.isShadow, isFalse);
      expect(view.snapshot.level, isNull);
    });

    test('shadow data comes from the nested snapshot without authority', () {
      final payload = _monthlyResponse(snapshotState: 'shadow')
        ..['currentLevel'] = null
        ..['sourceMonth'] = null
        ..['sourceScore'] = null;
      final view = MonthlyRewardsView.fromJson(payload);
      expect(view.hasConfirmedLevel, isFalse);
      expect(view.rewardsReady, isFalse);
      expect(view.snapshot.isShadow, isTrue);
      expect(view.snapshot.level, 1);
      expect(view.snapshot.sourceScore, 500);
      expect(view.snapshot.sourceMonth, '2026-09');
    });

    test('numeric top-level fields alone do not establish confirmation', () {
      final payload = _monthlyResponse()..remove('snapshot');
      expect(MonthlyRewardsView.fromJson(payload).hasConfirmedLevel, isFalse);
    });

    test(
      'mismatched periods and fractional snapshot scores stay unassessed',
      () {
        for (final change in [
          {'effectiveMonth': '2026-11'},
          {'sourceMonth': '2026-10'},
          {'sourceScore': 500.5},
          {'level': 1.5},
          {'levelKind': 'unassessed_default'},
        ]) {
          final payload = _monthlyResponse();
          (payload['snapshot'] as Map<String, dynamic>).addAll(change);
          final view = MonthlyRewardsView.fromJson(payload);
          expect(view.hasConfirmedLevel, isFalse);
          expect(view.snapshot.isAssessed, isFalse);
        }
      },
    );

    test('historical v1 retains its ceiling and cannot use the v2 ceiling', () {
      final payload = _monthlyResponse()
        ..['sourceScore'] = 13500
        ..['currentLevel'] = 5;
      final snapshot = payload['snapshot'] as Map<String, dynamic>;
      snapshot.addAll({'sourceScore': 13500, 'level': 5});
      expect(MonthlyRewardsView.fromJson(payload).hasConfirmedLevel, isTrue);
      snapshot['maximumSourceMonth'] = 13650;
      final widened = MonthlyRewardsView.fromJson(payload);
      expect(widened.hasConfirmedLevel, isFalse);
      expect(widened.snapshot.maximumSourceMonth, isNull);
    });

    test('explicit v2 preparation preserves the 13,650 shadow projection', () {
      final view = MonthlyRewardsView.fromJson(_preparedMonthlyResponse());
      expect(view.hasConfirmedLevel, isFalse);
      expect(view.rewardsReady, isFalse);
      expect(view.snapshot.isShadow, isTrue);
      expect(view.snapshot.preparationOnly, isTrue);
      expect(view.snapshot.maximumSourceMonth, 13650);
      expect(view.snapshot.sourceMonth, '2026-12');
      expect(view.snapshot.effectiveMonth, '2027-01');
      expect(view.snapshot.sourceScore, 13650);
    });

    test('preparation markers cannot produce confirmed level authority', () {
      for (final field in ['preparationOnly', 'runtimeActivationAllowed']) {
        final payload = _monthlyResponse()
          ..[field] = field == 'preparationOnly';
        expect(MonthlyRewardsView.fromJson(payload).hasConfirmedLevel, isFalse);
      }
      final payload = _preparedMonthlyResponse();
      (payload['snapshotProjection'] as Map<String, dynamic>)['state'] =
          'confirmed';
      expect(MonthlyRewardsView.fromJson(payload).hasConfirmedLevel, isFalse);
    });

    test('unknown policy or response versions do not invent a ceiling', () {
      final unknownPolicy = _monthlyResponse();
      (unknownPolicy['snapshot'] as Map<String, dynamic>)['policyVersion'] =
          'future-policy';
      final unknownResponse = _monthlyResponse()
        ..['responseVersion'] = 'future-response';
      final incompletePreparation = _preparedMonthlyResponse()
        ..remove('runtimeActivationAllowed');
      for (final payload in [
        unknownPolicy,
        unknownResponse,
        incompletePreparation,
      ]) {
        final view = MonthlyRewardsView.fromJson(payload);
        expect(view.hasConfirmedLevel, isFalse);
        expect(view.snapshot.isAssessed, isFalse);
        expect(view.snapshot.maximumSourceMonth, isNull);
      }
    });
  });
}

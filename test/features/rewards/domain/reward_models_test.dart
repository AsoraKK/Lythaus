import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

void main() {
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
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for RewardsApi
void main() {
  final instance = LythausApiClient().getRewardsApi();

  group(RewardsApi, () {
    // Read my monthly level and reward eligibility
    //
    // Returns the server-owned fixed monthly level snapshot and the member's current reward selection state. Paid tier changes reward choices only, not reputation scoring. No snapshot, selection or partner state is exposed until its owner-approved configuration is available.
    //
    //Future<MonthlyRewardsMeResponse> getMyMonthlyRewards() async
    test('test getMyMonthlyRewards', () async {
      // TODO
    });

    // Get my rewards snapshot
    //
    // Returns rewards available under the caller's subscription tier, reputation level, redemption limits, and fraud/maturity checks.
    //
    //Future<RewardsMeResponse> rewardsMeGet() async
    test('test rewardsMeGet', () async {
      // TODO
    });

    // Redeem a reward
    //
    //Future<RewardRedemption> rewardsRedeemPost(String id, { String idempotencyKey }) async
    test('test rewardsRedeemPost', () async {
      // TODO
    });

  });
}

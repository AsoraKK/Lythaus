import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for RewardsApi
void main() {
  final instance = LythausApiClient().getRewardsApi();

  group(RewardsApi, () {
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
    //Future<RewardRedemption> rewardsRedeemPost(String id) async
    test('test rewardsRedeemPost', () async {
      // TODO
    });

  });
}

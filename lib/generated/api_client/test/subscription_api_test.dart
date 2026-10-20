import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for SubscriptionApi
void main() {
  final instance = LythausApiClient().getSubscriptionApi();

  group(SubscriptionApi, () {
    // Get current account access tier
    //
    // Return the authenticated account's server-recorded access tier and its custom-feed and News Board entitlements. The Worker derives this response from identity.user_entitlements.subscription_tier; missing or unknown stored values resolve to Free. The current contract has no provider, pending-purchase, payment-confirmation, cancellation, or expiry state. Manual tier changes are supported, but this response does not identify how a tier was granted. Unknown extra response fields must not be interpreted as payment lifecycle state.
    //
    //Future<SubscriptionStatus> subscriptionStatus() async
    test('test subscriptionStatus', () async {
      // TODO
    });

  });
}

import 'package:built_value/serializer.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:lythaus_api_client/src/serializers.dart';
import 'package:test/test.dart';

SubscriptionStatus _decode(Map<String, dynamic> json) {
  return standardSerializers.deserialize(
        json,
        specifiedType: const FullType(SubscriptionStatus),
      )!
      as SubscriptionStatus;
}

void main() {
  group('SubscriptionStatus', () {
    test('decodes the server-issued Black entitlement response', () {
      final status = _decode({
        'tier': 'black',
        'entitlements': {'maxCustomFeeds': 3, 'newsBoardAccess': 'full'},
      });

      expect(status.tier, SubscriptionStatusTierEnum.black);
      expect(status.entitlements.maxCustomFeeds, 3);
      expect(
        status.entitlements.newsBoardAccess,
        SubscriptionStatusEntitlementsNewsBoardAccessEnum.full,
      );
    });

    test('ignores unsupported legacy provider and payment lifecycle keys', () {
      final status = _decode({
        'tier': 'premium',
        'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
        'status': 'pending',
        'provider': 'manual',
        'currentPeriodEnd': '2026-12-31T00:00:00Z',
        'cancelAtPeriodEnd': true,
        'paymentConfirmed': true,
      });

      expect(status.tier, SubscriptionStatusTierEnum.premium);
      expect(status.entitlements.maxCustomFeeds, 2);
      expect(
        status.entitlements.newsBoardAccess,
        SubscriptionStatusEntitlementsNewsBoardAccessEnum.none,
      );

      final encoded = standardSerializers.serialize(
        status,
        specifiedType: const FullType(SubscriptionStatus),
      )! as Map<String, dynamic>;
      expect(encoded.keys, containsAll(['tier', 'entitlements']));
      expect(encoded.keys, isNot(contains('status')));
      expect(encoded.keys, isNot(contains('provider')));
      expect(encoded.keys, isNot(contains('paymentConfirmed')));
    });
  });
}

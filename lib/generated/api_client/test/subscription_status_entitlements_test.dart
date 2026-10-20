import 'package:built_value/serializer.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:lythaus_api_client/src/serializers.dart';
import 'package:test/test.dart';

void main() {
  group('SubscriptionStatusEntitlements', () {
    test('round-trips Free, Premium, and Black feed entitlements', () {
      const cases = <Map<String, Object>>[
        {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
        {'maxCustomFeeds': 3, 'newsBoardAccess': 'full'},
      ];

      for (final entry in cases) {
        final decoded = standardSerializers.deserialize(
          entry,
          specifiedType: const FullType(SubscriptionStatusEntitlements),
        )!
            as SubscriptionStatusEntitlements;

        expect(decoded.maxCustomFeeds, entry['maxCustomFeeds']);
        expect(
          decoded.newsBoardAccess,
          SubscriptionStatusEntitlementsNewsBoardAccessEnum.valueOf(
            entry['newsBoardAccess']! as String,
          ),
        );
      }
    });
  });
}

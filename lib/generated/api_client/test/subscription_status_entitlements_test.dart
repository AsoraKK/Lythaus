import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:built_value/serializer.dart';
import 'package:test/test.dart';

void main() {
  test('feed entitlements round-trip and drop unknown nested policy fields',
      () {
    final wire = <String, Object?>{
      'maxCustomFeeds': 3,
      'newsBoardAccess': 'full',
      'dailyReactions': 100,
    };
    final entitlements = standardSerializers.deserializeWith(
      SubscriptionStatusEntitlements.serializer,
      wire,
    )!;

    expect(entitlements.maxCustomFeeds, 3);
    expect(
      entitlements.newsBoardAccess,
      SubscriptionStatusEntitlementsNewsBoardAccessEnum.full,
    );
    expect(
      standardSerializers.serializeWith(
        SubscriptionStatusEntitlements.serializer,
        entitlements,
      ),
      {'maxCustomFeeds': 3, 'newsBoardAccess': 'full'},
    );
  });

  test('missing or malformed required entitlement fields fail decoding', () {
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatusEntitlements.serializer,
        {'maxCustomFeeds': 1},
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatusEntitlements.serializer,
        {'newsBoardAccess': 'none'},
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatusEntitlements.serializer,
        {'maxCustomFeeds': '3', 'newsBoardAccess': 'full'},
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatusEntitlements.serializer,
        {'maxCustomFeeds': 3, 'newsBoardAccess': 'preview'},
      ),
      throwsA(isA<DeserializationError>()),
    );
  });
}

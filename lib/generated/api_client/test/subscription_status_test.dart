import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:built_value/serializer.dart';
import 'package:test/test.dart';

void main() {
  final cases = <Map<String, Object>>[
    {
      'wireTier': 'free',
      'tier': SubscriptionStatusTierEnum.free,
      'maxCustomFeeds': 1,
      'wireNewsBoardAccess': 'none',
      'newsBoardAccess': SubscriptionStatusEntitlementsNewsBoardAccessEnum.none,
    },
    {
      'wireTier': 'premium',
      'tier': SubscriptionStatusTierEnum.premium,
      'maxCustomFeeds': 2,
      'wireNewsBoardAccess': 'none',
      'newsBoardAccess': SubscriptionStatusEntitlementsNewsBoardAccessEnum.none,
    },
    {
      'wireTier': 'black',
      'tier': SubscriptionStatusTierEnum.black,
      'maxCustomFeeds': 3,
      'wireNewsBoardAccess': 'full',
      'newsBoardAccess': SubscriptionStatusEntitlementsNewsBoardAccessEnum.full,
    },
  ];

  for (final expected in cases) {
    final tier = expected['wireTier'] as String;
    final maxCustomFeeds = expected['maxCustomFeeds'] as int;
    final newsBoardAccess = expected['wireNewsBoardAccess'] as String;
    test('$tier tier round-trips the active wire payload', () {
      final wire = <String, Object?>{
        'tier': tier,
        'entitlements': {
          'maxCustomFeeds': maxCustomFeeds,
          'newsBoardAccess': newsBoardAccess,
        },
      };

      final status = standardSerializers.deserializeWith(
        SubscriptionStatus.serializer,
        wire,
      )!;

      expect(status.tier, expected['tier']);
      expect(status.entitlements.maxCustomFeeds, maxCustomFeeds);
      expect(status.entitlements.newsBoardAccess, expected['newsBoardAccess']);
      expect(
        standardSerializers.serializeWith(
            SubscriptionStatus.serializer, status),
        wire,
      );
    });
  }

  test('unknown lifecycle and safety fields do not become membership state',
      () {
    final wire = <String, Object?>{
      'tier': 'premium',
      'status': 'pending',
      'provider': 'manual',
      'paymentConfirmed': true,
      'currentPeriodEnd': '2026-12-31T00:00:00Z',
      'cancelAtPeriodEnd': true,
      'manualGrantExpiresAt': '2026-12-31T00:00:00Z',
      'entitlements': {
        'maxCustomFeeds': 2,
        'newsBoardAccess': 'none',
        'dailyPosts': 5,
      },
    };

    final status = standardSerializers.deserializeWith(
      SubscriptionStatus.serializer,
      wire,
    )!;

    expect(status.tier, SubscriptionStatusTierEnum.premium);
    expect(status.entitlements.maxCustomFeeds, 2);
    expect(
      standardSerializers.serializeWith(SubscriptionStatus.serializer, status),
      {
        'tier': 'premium',
        'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
      },
    );
  });

  test('missing required values and unknown tier enums fail decoding', () {
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus.serializer,
        {
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        },
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus.serializer,
        {
          'tier': 'unknown',
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        },
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus.serializer,
        {'tier': 'free'},
      ),
      throwsA(isA<DeserializationError>()),
    );
  });
}

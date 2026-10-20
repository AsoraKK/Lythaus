import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/ui/screens/home/news_feed.dart';

const _newsFeed = FeedModel(
  id: 'news',
  name: 'News Board',
  type: FeedType.news,
  contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

Widget _screen(Future<FeedEntitlements?> Function() loadEntitlements) {
  return ProviderScope(
    overrides: [
      feedEntitlementsProvider.overrideWith((ref) => loadEntitlements()),
    ],
    child: const MaterialApp(
      home: Scaffold(body: NewsFeed(feed: _newsFeed, items: [])),
    ),
  );
}

Future<FeedEntitlements> _fromResponse(Map<String, dynamic> response) async {
  return FeedEntitlements.fromSubscription(
    SubscriptionStatus.fromJson(response),
  );
}

void main() {
  testWidgets('unavailable account tier is not presented as Free or Black', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(() async => throw StateError('entitlement read unavailable')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t verify News Board access'), findsOneWidget);
    expect(find.text('News Board is Black-only'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('unknown response tier is shown as unavailable, not Free', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        () => _fromResponse({
          'tier': 'unknown',
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        }),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t verify News Board access'), findsOneWidget);
    expect(find.textContaining('Your current account tier is Free.'), findsNothing);
  });

  testWidgets('pending status does not change server-issued Free access', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        () => _fromResponse({
          'tier': 'free',
          'status': 'pending',
          'provider': 'stripe',
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        }),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('News Board is Black-only'), findsOneWidget);
    expect(
      find.textContaining('Your current account tier is Free.'),
      findsOneWidget,
    );
    expect(find.textContaining('pending status'), findsNothing);
  });

  testWidgets('manual Premium access is not presented as payment-confirmed', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        () => _fromResponse({
          'tier': 'premium',
          'status': 'active',
          'provider': 'manual',
          'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
        }),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Your current account tier is Premium.'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'does not report payment confirmation, pending purchases, or expiry.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('payment-confirmed claim is ignored by the access UI', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        () => _fromResponse({
          'tier': 'black',
          'status': 'confirmed',
          'provider': 'stripe',
          'paymentConfirmed': true,
          'entitlements': {'maxCustomFeeds': 3, 'newsBoardAccess': 'full'},
        }),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Current account tier: Black'), findsOneWidget);
    expect(
      find.textContaining(
        'This view shows access from your account tier. It does not report payment confirmation, pending purchases, or expiry.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('payment confirmed'), findsNothing);
    expect(find.textContaining('purchase pending'), findsNothing);
  });
}

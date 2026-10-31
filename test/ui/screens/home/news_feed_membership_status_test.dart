import 'dart:io';

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
      home: Scaffold(
        body: NewsFeed(feed: _newsFeed, items: []),
      ),
    ),
  );
}

Future<FeedEntitlements> _fromResponse(Map<String, dynamic> response) async {
  return FeedEntitlements.fromSubscription(
    SubscriptionStatus.fromJson(response),
  );
}

void main() {
  testWidgets('comparison matches the checked-in tier policy', (tester) async {
    final source = File(
      'packages/contracts/src/tier-policy.ts',
    ).readAsStringSync();
    final matches = RegExp(
      r"(free|premium|black):\s*\{\s*maxCustomFeeds:\s*(\d+),\s*newsBoardAccess:\s*'(none|full)'",
    ).allMatches(source);
    final policies = {
      for (final match in matches)
        match.group(1)!: (int.parse(match.group(2)!), match.group(3) == 'full'),
    };
    expect(policies.length, 3);
    await tester.pumpWidget(
      _screen(
        () async => FeedEntitlements(
          tier: 'free',
          maxCustomFeeds: policies['free']!.$1,
          newsBoardAccess: policies['free']!.$2 ? 'full' : 'none',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Compare feed access'));
    await tester.tap(find.text('Compare feed access'));
    await tester.pumpAndSettle();
    for (final tier in ['free', 'premium', 'black']) {
      final value = policies[tier]!;
      final title = switch (tier) {
        'free' => 'Free · Your access',
        'premium' => 'Premium',
        _ => 'Black',
      };
      final row = find.widgetWithText(ListTile, title);
      final count = value.$1;
      expect(
        find.descendant(
          of: row,
          matching: find.text(
            '$count custom feed${count == 1 ? '' : 's'} · '
            '${value.$2 ? 'News Board access' : 'No News Board access'}',
          ),
        ),
        findsOneWidget,
      );
    }
  });

  testWidgets(
    'comparison uses current server access and keeps Editorial separate',
    (tester) async {
      await tester.pumpWidget(
        _screen(
          () async => const FeedEntitlements(
            tier: 'free',
            maxCustomFeeds: 2,
            newsBoardAccess: 'none',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Compare feed access'));
      await tester.tap(find.text('Compare feed access'));
      await tester.pumpAndSettle();

      final currentRow = find.ancestor(
        of: find.text('Free · Your access'),
        matching: find.byType(ListTile),
      );
      expect(
        find.descendant(
          of: currentRow,
          matching: find.text('2 custom feeds · No News Board access'),
        ),
        findsOneWidget,
      );
      expect(find.text('Premium'), findsOneWidget);
      expect(find.text('Black'), findsOneWidget);
      expect(
        find.text('Editorial status is earned and separate from membership.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('comparison is usable at narrow width and large text', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 960));
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(() => tester.binding.setSurfaceSize(null));
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(
      _screen(
        () async => const FeedEntitlements(
          tier: 'premium',
          maxCustomFeeds: 2,
          newsBoardAccess: 'none',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Compare feed access'));
    await tester.tap(find.text('Compare feed access'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Premium · Your access'));
    expect(find.text('Premium · Your access').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

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
    expect(
      find.textContaining('Your current account tier is Free.'),
      findsNothing,
    );
  });

  testWidgets('Black access remains unavailable if the server denies it', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        () => _fromResponse({
          'tier': 'black',
          'entitlements': {'maxCustomFeeds': 3, 'newsBoardAccess': 'none'},
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('News Board is Black-only'), findsOneWidget);
    expect(
      find.textContaining(
        'News Board access is not currently available to this account.',
      ),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Compare feed access'));
    await tester.tap(find.text('Compare feed access'));
    await tester.pumpAndSettle();
    final row = find.widgetWithText(ListTile, 'Black · Your access');
    expect(
      find.descendant(
        of: row,
        matching: find.text('3 custom feeds · No News Board access'),
      ),
      findsOneWidget,
    );
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

    await tester.tap(find.text('About News Board'));
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

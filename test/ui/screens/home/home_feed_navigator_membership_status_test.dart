import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';

import '../../../helpers/content_recovery.dart';
import '../../../helpers/feed_session.dart';

class _Subscriptions extends Fake implements BackendSubscriptionService {
  _Subscriptions(this.loadStatus);

  final Future<SubscriptionStatus> Function() loadStatus;
  int statusRequests = 0;

  @override
  Future<SubscriptionStatus> checkStatus({required String token}) {
    statusRequests++;
    return loadStatus();
  }
}

class _Feeds extends Fake implements SocialFeedRepository {
  int newsRequests = 0;

  @override
  Future<domain.FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) async {
    newsRequests++;
    return const domain.FeedResponse(
      posts: [],
      totalCount: 0,
      hasMore: false,
      page: 1,
      pageSize: 25,
    );
  }
}

SubscriptionStatus _status(String tier) {
  final (maxCustomFeeds, newsBoardAccess) = switch (tier) {
    'free' => (1, 'none'),
    'premium' => (2, 'none'),
    'black' => (3, 'full'),
    _ => throw StateError('Unsupported test tier: $tier'),
  };
  return SubscriptionStatus.fromJson({
    'tier': tier,
    'entitlements': {
      'maxCustomFeeds': maxCustomFeeds,
      'newsBoardAccess': newsBoardAccess,
    },
  });
}

Future<void> _pumpNavigator(
  WidgetTester tester, {
  required _Subscriptions subscriptions,
  required _Feeds feeds,
  bool authenticated = true,
}) async {
  final auth = FeedTestAuth(
    authenticated ? feedTestUser('membership-member') : null,
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        authStateProvider.overrideWith((ref) => auth),
        jwtProvider.overrideWith((ref) async => 'synthetic-token'),
        subscriptionServiceProvider.overrideWithValue(subscriptions),
        socialFeedServiceProvider.overrideWithValue(feeds),
        customFeedsProvider.overrideWith((ref) async => const <FeedModel>[]),
      ],
      child: MaterialApp(
        theme: LythausTheme.light(),
        home: const HomeFeedNavigator(section: AlphaFeedSection.newsBoard),
      ),
    ),
  );
}

void main() {
  for (final tier in ['free', 'premium']) {
    testWidgets('$tier route shows the tier explanation without reading news', (
      tester,
    ) async {
      final subscriptions = _Subscriptions(() async => _status(tier));
      final feeds = _Feeds();

      await _pumpNavigator(tester, subscriptions: subscriptions, feeds: feeds);
      await tester.pumpAndSettle();

      final label = tier == 'free' ? 'Free' : 'Premium';
      expect(find.text('News Board is Black-only'), findsOneWidget);
      expect(
        find.textContaining('Your current account tier is $label.'),
        findsOneWidget,
      );
      expect(feeds.newsRequests, 0);
    });
  }

  testWidgets('Black route loads News Board content after authorization', (
    tester,
  ) async {
    final subscriptions = _Subscriptions(() async => _status('black'));
    final feeds = _Feeds();

    await _pumpNavigator(tester, subscriptions: subscriptions, feeds: feeds);
    await tester.pumpAndSettle();

    await tester.tap(find.text('About News Board'));
    await tester.pumpAndSettle();
    expect(find.text('Current account tier: Black'), findsOneWidget);
    expect(feeds.newsRequests, 1);
  });

  testWidgets('loading route waits for the authoritative tier before reading', (
    tester,
  ) async {
    final status = Completer<SubscriptionStatus>();
    final subscriptions = _Subscriptions(() => status.future);
    final feeds = _Feeds();

    await _pumpNavigator(tester, subscriptions: subscriptions, feeds: feeds);
    await tester.pump();

    expect(find.bySemanticsLabel('Checking News Board access'), findsOneWidget);
    expect(feeds.newsRequests, 0);

    status.complete(_status('free'));
    await tester.pumpAndSettle();
    expect(find.text('News Board is Black-only'), findsOneWidget);
    expect(feeds.newsRequests, 0);
  });

  testWidgets('unavailable signed-out route does not invent a tier', (
    tester,
  ) async {
    final subscriptions = _Subscriptions(() async => _status('black'));
    final feeds = _Feeds();

    await _pumpNavigator(
      tester,
      subscriptions: subscriptions,
      feeds: feeds,
      authenticated: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t verify News Board access'), findsOneWidget);
    expect(find.text('News Board is Black-only'), findsNothing);
    expect(subscriptions.statusRequests, 0);
    expect(feeds.newsRequests, 0);
  });

  testWidgets('entitlement read errors show retry and never read News Board', (
    tester,
  ) async {
    final subscriptions = _Subscriptions(() async {
      throw StateError('membership status unavailable');
    });
    final feeds = _Feeds();

    await _pumpNavigator(tester, subscriptions: subscriptions, feeds: feeds);
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t verify News Board access'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(subscriptions.statusRequests, 1);
    expect(feeds.newsRequests, 0);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(subscriptions.statusRequests, greaterThanOrEqualTo(2));
    expect(feeds.newsRequests, 0);
  });
}

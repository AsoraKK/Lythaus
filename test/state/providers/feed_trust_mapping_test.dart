import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/feed_card.dart';

const feed = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

domain.Post post(String status) => domain.Post.fromJson({
  'id': status,
  'authorId': 'synthetic-owner',
  'authorUsername': 'Owner',
  'body': 'Unresolved synthetic appeal',
  'createdAt': '2026-10-02T00:00:00Z',
  'trustStatus': status,
  'timeline': {
    'created': 'complete',
    'mediaChecked': 'complete',
    'moderation': status == 'under_appeal' ? 'warn' : 'complete',
    if (status == 'under_appeal') 'appeal': 'open',
  },
  'hasAppeal': status == 'under_appeal',
  'proofSignalsProvided': true,
  'verifiedContextBadgeEligible': status != 'under_appeal',
  'featuredEligible': status != 'under_appeal',
});

class Repository extends Fake implements SocialFeedRepository {
  @override
  Future<domain.FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) async => domain.FeedResponse(
    posts: [
      post(cursor == null ? 'under_appeal' : 'verified_signals_attached'),
    ],
    totalCount: 2,
    hasMore: cursor == null,
    nextCursor: cursor == null ? 'next' : null,
    page: cursor == null ? 1 : 2,
    pageSize: limit,
  );
}

ProviderContainer container() => ProviderContainer(
  overrides: [
    socialFeedServiceProvider.overrideWithValue(Repository()),
    jwtProvider.overrideWith((ref) async => null),
  ],
);

void main() {
  test(
    'parsed discovery posts retain appeal, timeline and eligibility metadata',
    () async {
      final scope = container();
      addTearDown(scope.dispose);
      final items = await scope.read(liveFeedItemsProvider(feed).future);
      final trust = items.single.trustSummary;
      expect(trust.trustStatus, 'under_appeal');
      expect(trust.timeline.created, 'complete');
      expect(trust.timeline.mediaChecked, 'complete');
      expect(trust.timeline.moderation, 'warn');
      expect(trust.timeline.appeal, 'open');
      expect(trust.hasAppeal, isTrue);
      expect(trust.proofSignalsProvided, isTrue);
      expect(trust.verifiedContextBadgeEligible, isFalse);
      expect(trust.featuredEligible, isFalse);
    },
  );

  test(
    'initial and paginated live-feed items retain distinct trust summaries',
    () async {
      final scope = container();
      addTearDown(scope.dispose);
      scope.read(liveFeedStateProvider(feed));
      await Future<void>.delayed(Duration.zero);
      expect(
        scope
            .read(liveFeedStateProvider(feed))
            .items
            .single
            .trustSummary
            .trustStatus,
        'under_appeal',
      );
      await scope.read(liveFeedStateProvider(feed).notifier).loadMore();
      final items = scope.read(liveFeedStateProvider(feed)).items;
      expect(items, hasLength(2));
      expect(items.first.trustSummary.timeline.appeal, 'open');
      final verified = items.last.trustSummary;
      expect(verified.trustStatus, 'verified_signals_attached');
      expect(verified.timeline.moderation, 'complete');
      expect(verified.hasAppeal, isFalse);
      expect(verified.proofSignalsProvided, isTrue);
      expect(verified.verifiedContextBadgeEligible, isTrue);
      expect(verified.featuredEligible, isTrue);
    },
  );

  testWidgets(
    'mapped feed card renders unresolved moderation and appeal status',
    (tester) async {
      final scope = container();
      addTearDown(scope.dispose);
      final items = await scope.read(liveFeedItemsProvider(feed).future);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: FeedCard(item: items.single, onTap: () {}),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Under appeal'), findsOneWidget);
      expect(find.text('Moderation: warn'), findsOneWidget);
      expect(find.text('Appeal: open'), findsOneWidget);
      expect(find.text('Moderation: none'), findsNothing);
      expect(find.text('No extra signals'), findsNothing);
    },
  );
}

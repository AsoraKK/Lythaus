import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/models/post_feed_item_mapper.dart';
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
  'visibility': 'public',
  'moderationState': 'allowed',
  'publicLabel': 'Human-authored',
  'feedItemDeleted': false,
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
    String? tag,
    FeedRequestCancellation? cancellation,
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
  for (final status in [
    'under_review',
    'under_appeal',
    'verified_signals_attached',
  ]) {
    test('pure projection preserves $status without deciding eligibility', () {
      final underReview = status == 'under_review';
      final hasAppeal = status == 'under_appeal';
      final verified = status == 'verified_signals_attached';
      final input = domain.Post.fromJson({
        ...post(status).toJson(),
        'moderationState': underReview ? 'under_review' : 'allowed',
        'timeline': {
          'created': 'complete',
          'mediaChecked': 'complete',
          'moderation': underReview ? 'warn' : 'complete',
          if (hasAppeal) 'appeal': 'open',
        },
        'proofSignalsProvided': verified,
        'verifiedContextBadgeEligible': verified,
        'featuredEligible': verified,
        'authorship': {
          'authorshipLabel': underReview ? 'Under review' : 'AI-assisted',
          'classificationSource': 'user_disclosure',
        },
        'mediaUrls': [
          'https://example.invalid/first.png',
          'https://example.invalid/second.png',
        ],
        'source': {
          'name': 'Source fixture',
          'url': 'https://example.invalid/story',
        },
        'metadata': {
          'category': 'Headline',
          'tags': ['fixture'],
          'isPinned': true,
        },
        'isNews': true,
      });
      final original = input.toJson();
      for (final feedId in ['live', 'search', 'trending']) {
        final item = mapPostToFeedItem(
          input,
          feedId: feedId,
          fallbackTitle: 'Unused',
        );
        expect(item.id, status);
        expect(item.feedId, feedId);
        expect(item.authorId, 'synthetic-owner');
        expect(item.author, 'Owner');
        expect(item.body, 'Unresolved synthetic appeal');
        expect(item.title, 'Headline');
        expect(item.publishedAt, DateTime.utc(2026, 10, 2));
        expect(item.contentType, ContentType.image);
        expect(item.imageUrl, 'https://example.invalid/first.png');
        expect(item.sourceName, 'Source fixture');
        expect(item.sourceUrl, 'https://example.invalid/story');
        expect(item.tags, ['fixture']);
        expect(item.isNews, isTrue);
        expect(item.isPinned, isTrue);
        expect(
          item.authorshipLabel,
          underReview ? 'Under review' : 'AI-assisted',
        );
        expect(item.classificationSource, 'user_disclosure');
        final trust = item.trustSummary;
        expect(trust.trustStatus, underReview ? 'no_extra_signals' : status);
        expect(trust.timeline.created, 'complete');
        expect(trust.timeline.mediaChecked, 'complete');
        expect(trust.timeline.moderation, underReview ? 'warn' : 'complete');
        expect(trust.timeline.appeal, hasAppeal ? 'open' : null);
        expect(trust.hasAppeal, hasAppeal);
        expect(trust.proofSignalsProvided, verified);
        expect(trust.verifiedContextBadgeEligible, verified);
        expect(trust.featuredEligible, verified);
      }
      expect(input.toJson(), original);
    });
  }

  test('absent and empty media retain text and view-specific fallbacks', () {
    for (final media in [null, <String>[]]) {
      final input = domain.Post.fromJson({'id': 'minimal', 'mediaUrls': media});
      for (final fallback in ['Update', 'Result']) {
        final item = mapPostToFeedItem(
          input,
          feedId: 'fixture',
          fallbackTitle: fallback,
        );
        expect(item.contentType, ContentType.text);
        expect(item.imageUrl, isNull);
        expect(item.sourceName, isNull);
        expect(item.sourceUrl, isNull);
        expect(item.title, fallback);
        expect(item.tags, isEmpty);
        expect(item.isNews, isFalse);
        expect(item.isPinned, isFalse);
        expect(item.authorshipLabel, 'Under review');
        expect(item.trustSummary.verifiedContextBadgeEligible, isFalse);
        expect(item.trustSummary.featuredEligible, isFalse);
      }
    }
  });

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

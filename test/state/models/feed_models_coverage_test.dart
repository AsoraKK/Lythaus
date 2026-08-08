import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';

void main() {
  group('ContentFilters', () {
    test('allows matching content type', () {
      const filters = ContentFilters(
        allowedTypes: {ContentType.text, ContentType.image},
      );
      expect(filters.allows(ContentType.text), isTrue);
      expect(filters.allows(ContentType.image), isTrue);
      expect(filters.allows(ContentType.video), isFalse);
    });

    test('allows any type when mixed is included', () {
      const filters = ContentFilters(allowedTypes: {ContentType.mixed});
      expect(filters.allows(ContentType.text), isTrue);
      expect(filters.allows(ContentType.image), isTrue);
      expect(filters.allows(ContentType.video), isTrue);
    });
  });

  group('FeedRefinements', () {
    test('has default empty lists', () {
      const r = FeedRefinements();
      expect(r.includeKeywords, isEmpty);
      expect(r.excludeKeywords, isEmpty);
      expect(r.includeAccounts, isEmpty);
      expect(r.excludeAccounts, isEmpty);
    });

    test('copyWith updates specified fields', () {
      const original = FeedRefinements(
        includeKeywords: ['dart'],
        excludeKeywords: ['spam'],
      );
      final updated = original.copyWith(
        includeKeywords: ['flutter', 'dart'],
        includeAccounts: ['user1'],
      );
      expect(updated.includeKeywords, ['flutter', 'dart']);
      expect(updated.excludeKeywords, ['spam']); // preserved
      expect(updated.includeAccounts, ['user1']);
      expect(updated.excludeAccounts, isEmpty); // preserved
    });

    test('copyWith preserves original when no args', () {
      const original = FeedRefinements(
        includeKeywords: ['a'],
        excludeKeywords: ['b'],
        includeAccounts: ['c'],
        excludeAccounts: ['d'],
      );
      final copy = original.copyWith();
      expect(copy.includeKeywords, ['a']);
      expect(copy.excludeKeywords, ['b']);
      expect(copy.includeAccounts, ['c']);
      expect(copy.excludeAccounts, ['d']);
    });
  });

  group('FeedModel', () {
    FeedModel makeFeed({
      String id = 'f1',
      String name = 'Test Feed',
      FeedType type = FeedType.discover,
      SortingRule sorting = SortingRule.hot,
      int subscriptionLevelRequired = 0,
      bool isCustom = false,
      bool isHome = false,
    }) {
      return FeedModel(
        id: id,
        name: name,
        type: type,
        contentFilters: const ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: sorting,
        refinements: const FeedRefinements(),
        subscriptionLevelRequired: subscriptionLevelRequired,
        isCustom: isCustom,
        isHome: isHome,
      );
    }

    test('can be constructed', () {
      final feed = makeFeed();
      expect(feed.id, 'f1');
      expect(feed.name, 'Test Feed');
      expect(feed.type, FeedType.discover);
      expect(feed.isCustom, isFalse);
      expect(feed.isHome, isFalse);
    });

    test('copyWith updates specified fields', () {
      final feed = makeFeed();
      final updated = feed.copyWith(
        name: 'Updated',
        type: FeedType.news,
        isHome: true,
        isCustom: true,
        subscriptionLevelRequired: 2,
        sorting: SortingRule.newest,
      );
      expect(updated.id, 'f1'); // preserved
      expect(updated.name, 'Updated');
      expect(updated.type, FeedType.news);
      expect(updated.isHome, isTrue);
      expect(updated.isCustom, isTrue);
      expect(updated.subscriptionLevelRequired, 2);
      expect(updated.sorting, SortingRule.newest);
    });

    test('copyWith preserves fields when not specified', () {
      final feed = makeFeed(name: 'Original', isHome: true);
      final copy = feed.copyWith();
      expect(copy.name, 'Original');
      expect(copy.isHome, isTrue);
    });
  });

  group('CustomFeedDraft', () {
    test('has default values', () {
      const draft = CustomFeedDraft();
      expect(draft.contentType, ContentType.mixed);
      expect(draft.sorting, SortingRule.relevant);
      expect(draft.name, '');
      expect(draft.setAsHome, isFalse);
    });

    test('copyWith updates fields', () {
      const draft = CustomFeedDraft();
      final updated = draft.copyWith(
        contentType: ContentType.video,
        sorting: SortingRule.hot,
        name: 'My Feed',
        setAsHome: true,
      );
      expect(updated.contentType, ContentType.video);
      expect(updated.sorting, SortingRule.hot);
      expect(updated.name, 'My Feed');
      expect(updated.setAsHome, isTrue);
    });

    test('copyWith preserves fields when not specified', () {
      const draft = CustomFeedDraft(name: 'Keep', sorting: SortingRule.newest);
      final copy = draft.copyWith(setAsHome: true);
      expect(copy.name, 'Keep');
      expect(copy.sorting, SortingRule.newest);
      expect(copy.setAsHome, isTrue);
    });
  });

  group('FeedItem', () {
    test('can be constructed', () {
      final item = FeedItem(
        id: 'item1',
        feedId: 'feed1',
        author: 'alice',
        contentType: ContentType.text,
        title: 'Hello',
        body: 'World',
        publishedAt: DateTime(2025, 1, 1),
      );
      expect(item.id, 'item1');
      expect(item.author, 'alice');
      expect(item.authorId, isNull);
      expect(item.tags, isEmpty);
      expect(item.isNews, isFalse);
      expect(item.isPinned, isFalse);
    });
  });

  group('FeedTrustSummary', () {
    test('has default values', () {
      const summary = FeedTrustSummary();
      expect(summary.trustStatus, 'no_extra_signals');
      expect(summary.hasAppeal, isFalse);
      expect(summary.proofSignalsProvided, isFalse);
      expect(summary.verifiedContextBadgeEligible, isFalse);
      expect(summary.featuredEligible, isFalse);
    });
  });

  group('FeedTrustTimeline', () {
    test('has default values', () {
      const timeline = FeedTrustTimeline();
      expect(timeline.created, 'complete');
      expect(timeline.mediaChecked, 'none');
      expect(timeline.moderation, 'none');
      expect(timeline.appeal, isNull);
    });
  });

  group('LiveFeedState', () {
    test('hasMore returns true when nextCursor is non-empty', () {
      const state = LiveFeedState(nextCursor: 'abc');
      expect(state.hasMore, isTrue);
    });

    test('hasMore returns false when nextCursor is null', () {
      const state = LiveFeedState();
      expect(state.hasMore, isFalse);
    });

    test('hasMore returns false when nextCursor is empty', () {
      const state = LiveFeedState(nextCursor: '');
      expect(state.hasMore, isFalse);
    });

    test('copyWith updates fields', () {
      const state = LiveFeedState(nextCursor: 'abc', isInitialLoading: true);
      final updated = state.copyWith(
        isInitialLoading: false,
        isLoadingMore: true,
        errorMessage: 'fail',
      );
      expect(updated.nextCursor, 'abc');
      expect(updated.isInitialLoading, isFalse);
      expect(updated.isLoadingMore, isTrue);
      expect(updated.errorMessage, 'fail');
    });

    test('copyWith clearCursor sets nextCursor to null', () {
      const state = LiveFeedState(nextCursor: 'abc');
      final updated = state.copyWith(clearCursor: true);
      expect(updated.nextCursor, isNull);
    });

    test('copyWith clearError sets errorMessage to null', () {
      const state = LiveFeedState(errorMessage: 'oops');
      final updated = state.copyWith(clearError: true);
      expect(updated.errorMessage, isNull);
    });
  });

  group('CustomFeedDraftNotifier', () {
    test('setContentType updates state', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.setContentType(ContentType.video);
      expect(notifier.state.contentType, ContentType.video);
    });

    test('setSorting updates state', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.setSorting(SortingRule.newest);
      expect(notifier.state.sorting, SortingRule.newest);
    });

    test('updateRefinements updates state', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.updateRefinements(
        const FeedRefinements(includeKeywords: ['dart']),
      );
      expect(notifier.state.refinements.includeKeywords, ['dart']);
    });

    test('setName updates state', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.setName('My Feed');
      expect(notifier.state.name, 'My Feed');
    });

    test('setHome updates state', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.setHome(true);
      expect(notifier.state.setAsHome, isTrue);
    });

    test('reset returns to default', () {
      final notifier = CustomFeedDraftNotifier();
      notifier.setName('Temp');
      notifier.setSorting(SortingRule.hot);
      notifier.reset();
      expect(notifier.state.name, '');
      expect(notifier.state.sorting, SortingRule.relevant);
    });
  });
}

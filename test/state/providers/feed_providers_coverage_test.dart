import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';

void main() {
  // ─────── LiveFeedState ───────

  group('LiveFeedState', () {
    test('defaults', () {
      const s = LiveFeedState();
      expect(s.items, isEmpty);
      expect(s.nextCursor, isNull);
      expect(s.isInitialLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.errorMessage, isNull);
      expect(s.hasMore, isFalse);
    });

    test('hasMore true when cursor non-empty', () {
      const s = LiveFeedState(nextCursor: 'abc');
      expect(s.hasMore, isTrue);
    });

    test('hasMore false when cursor empty string', () {
      const s = LiveFeedState(nextCursor: '');
      expect(s.hasMore, isFalse);
    });

    test('copyWith preserves values', () {
      final items = [
        FeedItem(
          id: '1',
          feedId: 'f',
          author: 'a',
          contentType: ContentType.text,
          title: 't',
          body: 'b',
          publishedAt: DateTime(2024),
        ),
      ];
      final s = LiveFeedState(
        items: items,
        nextCursor: 'cur',
        isInitialLoading: true,
        isLoadingMore: true,
        errorMessage: 'err',
      );

      final copy = s.copyWith();
      expect(copy.items, items);
      expect(copy.nextCursor, 'cur');
      expect(copy.isInitialLoading, isTrue);
      expect(copy.isLoadingMore, isTrue);
      expect(copy.errorMessage, 'err');
    });

    test('copyWith clearCursor sets cursor to null', () {
      const s = LiveFeedState(nextCursor: 'cur');
      final copy = s.copyWith(clearCursor: true);
      expect(copy.nextCursor, isNull);
    });

    test('copyWith clearError sets errorMessage to null', () {
      const s = LiveFeedState(errorMessage: 'err');
      final copy = s.copyWith(clearError: true);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith overrides values', () {
      const s = LiveFeedState(nextCursor: 'old', errorMessage: 'old');
      final copy = s.copyWith(
        nextCursor: 'new',
        isInitialLoading: true,
        isLoadingMore: true,
        errorMessage: 'new',
      );
      expect(copy.nextCursor, 'new');
      expect(copy.isInitialLoading, isTrue);
      expect(copy.isLoadingMore, isTrue);
      expect(copy.errorMessage, 'new');
    });

    test('copyWith items override', () {
      final newItems = [
        FeedItem(
          id: '2',
          feedId: 'g',
          author: 'b',
          contentType: ContentType.image,
          title: 't2',
          body: 'b2',
          publishedAt: DateTime(2025),
        ),
      ];
      const s = LiveFeedState();
      final copy = s.copyWith(items: newItems);
      expect(copy.items, hasLength(1));
      expect(copy.items.first.id, '2');
    });
  });

  // ─────── CustomFeedDraftNotifier ───────

  group('CustomFeedDraftNotifier', () {
    late CustomFeedDraftNotifier notifier;

    setUp(() {
      notifier = CustomFeedDraftNotifier();
    });

    tearDown(() {
      notifier.dispose();
    });

    test('initial state is default CustomFeedDraft', () {
      expect(notifier.state.contentType, ContentType.mixed);
      expect(notifier.state.sorting, SortingRule.relevant);
      expect(notifier.state.name, '');
      expect(notifier.state.setAsHome, isFalse);
    });

    test('setContentType updates content type', () {
      notifier.setContentType(ContentType.image);
      expect(notifier.state.contentType, ContentType.image);
    });

    test('setSorting updates sorting', () {
      notifier.setSorting(SortingRule.newest);
      expect(notifier.state.sorting, SortingRule.newest);
    });

    test('updateRefinements updates refinements', () {
      const refinements = FeedRefinements(
        includeKeywords: ['dart'],
        excludeKeywords: ['java'],
      );
      notifier.updateRefinements(refinements);
      expect(notifier.state.refinements.includeKeywords, ['dart']);
      expect(notifier.state.refinements.excludeKeywords, ['java']);
    });

    test('setName updates name', () {
      notifier.setName('My Feed');
      expect(notifier.state.name, 'My Feed');
    });

    test('setHome updates setAsHome', () {
      notifier.setHome(true);
      expect(notifier.state.setAsHome, isTrue);
    });

    test('reset returns to default state', () {
      notifier.setName('Test');
      notifier.setSorting(SortingRule.hot);
      notifier.setContentType(ContentType.video);
      notifier.setHome(true);

      notifier.reset();

      expect(notifier.state.name, '');
      expect(notifier.state.sorting, SortingRule.relevant);
      expect(notifier.state.contentType, ContentType.mixed);
      expect(notifier.state.setAsHome, isFalse);
    });

    test('multiple sequential updates', () {
      notifier.setName('Feed A');
      notifier.setContentType(ContentType.text);
      notifier.setSorting(SortingRule.local);
      notifier.setHome(true);

      expect(notifier.state.name, 'Feed A');
      expect(notifier.state.contentType, ContentType.text);
      expect(notifier.state.sorting, SortingRule.local);
      expect(notifier.state.setAsHome, isTrue);
    });
  });

  // ─────── _mapPostToFeedItem (tested indirectly via FeedItem construction) ───────
  // The private function can't be tested directly, but its logic is exercised
  // through existing liveFeed tests. We test FeedItem construction here.

  group('FeedItem construction', () {
    test('creates text feed item', () {
      final item = FeedItem(
        id: 'p1',
        feedId: 'live',
        author: 'user1',
        authorId: 'u1',
        contentType: ContentType.text,
        title: 'Update',
        body: 'Hello world',
        publishedAt: DateTime(2024, 1, 1),
        tags: const ['tag1'],
        isNews: false,
        isPinned: false,
      );
      expect(item.id, 'p1');
      expect(item.contentType, ContentType.text);
      expect(item.isNews, isFalse);
      expect(item.isPinned, isFalse);
      expect(item.imageUrl, isNull);
      expect(item.videoThumbnailUrl, isNull);
      expect(item.sourceName, isNull);
      expect(item.sourceUrl, isNull);
    });

    test('creates image feed item', () {
      final item = FeedItem(
        id: 'p2',
        feedId: 'live',
        author: 'user2',
        contentType: ContentType.image,
        title: 'Photo',
        body: 'Check this out',
        publishedAt: DateTime(2024, 6, 15),
        imageUrl: 'https://example.com/img.jpg',
        isNews: true,
        isPinned: true,
        sourceName: 'Source',
        sourceUrl: 'https://source.com',
      );
      expect(item.imageUrl, 'https://example.com/img.jpg');
      expect(item.isNews, isTrue);
      expect(item.isPinned, isTrue);
      expect(item.sourceName, 'Source');
    });

    test('default trustSummary', () {
      final item = FeedItem(
        id: 'p3',
        feedId: 'live',
        author: 'user3',
        contentType: ContentType.text,
        title: 't',
        body: 'b',
        publishedAt: DateTime(2024),
      );
      expect(item.trustSummary.trustStatus, 'no_extra_signals');
      expect(item.trustSummary.hasAppeal, isFalse);
      expect(item.trustSummary.proofSignalsProvided, isFalse);
      expect(item.trustSummary.verifiedContextBadgeEligible, isFalse);
      expect(item.trustSummary.featuredEligible, isFalse);
    });

    test('with custom trustSummary', () {
      final item = FeedItem(
        id: 'p4',
        feedId: 'live',
        author: 'user4',
        contentType: ContentType.text,
        title: 't',
        body: 'b',
        publishedAt: DateTime(2024),
        trustSummary: const FeedTrustSummary(
          trustStatus: 'verified',
          hasAppeal: true,
          proofSignalsProvided: true,
          verifiedContextBadgeEligible: true,
          featuredEligible: true,
          timeline: FeedTrustTimeline(
            created: 'complete',
            mediaChecked: 'complete',
            moderation: 'complete',
            appeal: 'pending',
          ),
        ),
      );
      expect(item.trustSummary.trustStatus, 'verified');
      expect(item.trustSummary.hasAppeal, isTrue);
      expect(item.trustSummary.timeline.appeal, 'pending');
      expect(item.trustSummary.timeline.mediaChecked, 'complete');
    });
  });

  // ─────── FeedTrustSummary & FeedTrustTimeline ───────

  group('FeedTrustSummary', () {
    test('defaults', () {
      const s = FeedTrustSummary();
      expect(s.trustStatus, 'no_extra_signals');
      expect(s.hasAppeal, isFalse);
      expect(s.proofSignalsProvided, isFalse);
      expect(s.verifiedContextBadgeEligible, isFalse);
      expect(s.featuredEligible, isFalse);
    });
  });

  group('FeedTrustTimeline', () {
    test('defaults', () {
      const t = FeedTrustTimeline();
      expect(t.created, 'complete');
      expect(t.mediaChecked, 'none');
      expect(t.moderation, 'none');
      expect(t.appeal, isNull);
    });

    test('custom values', () {
      const t = FeedTrustTimeline(
        created: 'pending',
        mediaChecked: 'complete',
        moderation: 'flagged',
        appeal: 'approved',
      );
      expect(t.created, 'pending');
      expect(t.mediaChecked, 'complete');
      expect(t.moderation, 'flagged');
      expect(t.appeal, 'approved');
    });
  });
}

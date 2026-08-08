// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';

void main() {
  // ── LiveFeedState ─────────────────────────────────────────────────────
  group('LiveFeedState', () {
    test('defaults', () {
      const s = LiveFeedState();
      expect(s.items, isEmpty);
      expect(s.nextCursor, isNull);
      expect(s.isInitialLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.errorMessage, isNull);
    });

    test('hasMore is true when nextCursor is non-empty', () {
      const s = LiveFeedState(nextCursor: 'abc');
      expect(s.hasMore, isTrue);
    });

    test('hasMore is false when nextCursor is null', () {
      const s = LiveFeedState();
      expect(s.hasMore, isFalse);
    });

    test('hasMore is false when nextCursor is empty', () {
      const s = LiveFeedState(nextCursor: '');
      expect(s.hasMore, isFalse);
    });

    test('copyWith preserves defaults', () {
      const s = LiveFeedState(nextCursor: 'x', isInitialLoading: true);
      final copy = s.copyWith();
      expect(copy.nextCursor, 'x');
      expect(copy.isInitialLoading, isTrue);
    });

    test('copyWith overrides fields', () {
      const s = LiveFeedState();
      final copy = s.copyWith(
        nextCursor: 'cursor',
        isInitialLoading: true,
        isLoadingMore: true,
        errorMessage: 'err',
      );
      expect(copy.nextCursor, 'cursor');
      expect(copy.isInitialLoading, isTrue);
      expect(copy.isLoadingMore, isTrue);
      expect(copy.errorMessage, 'err');
    });

    test('copyWith clearCursor sets nextCursor to null', () {
      const s = LiveFeedState(nextCursor: 'x');
      final copy = s.copyWith(clearCursor: true);
      expect(copy.nextCursor, isNull);
    });

    test('copyWith clearError sets errorMessage to null', () {
      const s = LiveFeedState(errorMessage: 'fail');
      final copy = s.copyWith(clearError: true);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith with items', () {
      final item = _makeItem('1');
      const s = LiveFeedState();
      final copy = s.copyWith(items: [item]);
      expect(copy.items.length, 1);
      expect(copy.items.first.id, '1');
    });
  });

  // ── CustomFeedDraft ───────────────────────────────────────────────────
  group('CustomFeedDraft', () {
    test('defaults', () {
      const d = CustomFeedDraft();
      expect(d.contentType, ContentType.mixed);
      expect(d.sorting, SortingRule.relevant);
      expect(d.name, '');
      expect(d.setAsHome, isFalse);
    });

    test('copyWith overrides contentType', () {
      const d = CustomFeedDraft();
      final copy = d.copyWith(contentType: ContentType.image);
      expect(copy.contentType, ContentType.image);
    });

    test('copyWith overrides sorting', () {
      const d = CustomFeedDraft();
      final copy = d.copyWith(sorting: SortingRule.hot);
      expect(copy.sorting, SortingRule.hot);
    });

    test('copyWith overrides name', () {
      const d = CustomFeedDraft();
      final copy = d.copyWith(name: 'My Feed');
      expect(copy.name, 'My Feed');
    });

    test('copyWith overrides setAsHome', () {
      const d = CustomFeedDraft();
      final copy = d.copyWith(setAsHome: true);
      expect(copy.setAsHome, isTrue);
    });

    test('copyWith overrides refinements', () {
      const d = CustomFeedDraft();
      final copy = d.copyWith(
        refinements: const FeedRefinements(includeKeywords: ['test']),
      );
      expect(copy.refinements.includeKeywords, ['test']);
    });
  });

  // ── CustomFeedDraftNotifier ───────────────────────────────────────────
  group('CustomFeedDraftNotifier', () {
    late CustomFeedDraftNotifier notifier;

    setUp(() {
      notifier = CustomFeedDraftNotifier();
    });

    test('initial state is default', () {
      expect(notifier.state.name, '');
      expect(notifier.state.contentType, ContentType.mixed);
    });

    test('setContentType updates content type', () {
      notifier.setContentType(ContentType.video);
      expect(notifier.state.contentType, ContentType.video);
    });

    test('setSorting updates sorting', () {
      notifier.setSorting(SortingRule.newest);
      expect(notifier.state.sorting, SortingRule.newest);
    });

    test('setName updates name', () {
      notifier.setName('Tech News');
      expect(notifier.state.name, 'Tech News');
    });

    test('setHome updates setAsHome', () {
      notifier.setHome(true);
      expect(notifier.state.setAsHome, isTrue);
    });

    test('updateRefinements updates refinements', () {
      const r = FeedRefinements(
        includeKeywords: ['dart'],
        excludeAccounts: ['spam'],
      );
      notifier.updateRefinements(r);
      expect(notifier.state.refinements.includeKeywords, ['dart']);
      expect(notifier.state.refinements.excludeAccounts, ['spam']);
    });

    test('reset returns to default state', () {
      notifier.setName('Test');
      notifier.setSorting(SortingRule.hot);
      notifier.setHome(true);
      notifier.reset();
      expect(notifier.state.name, '');
      expect(notifier.state.sorting, SortingRule.relevant);
      expect(notifier.state.setAsHome, isFalse);
    });
  });

  // ── FeedModel ─────────────────────────────────────────────────────────
  group('FeedModel', () {
    FeedModel makeModel({String id = 'f1', bool isHome = false}) {
      return FeedModel(
        id: id,
        name: 'Feed',
        type: FeedType.discover,
        contentFilters: const ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: SortingRule.hot,
        refinements: const FeedRefinements(),
        subscriptionLevelRequired: 0,
        isHome: isHome,
      );
    }

    test('copyWith overrides id', () {
      final m = makeModel();
      expect(m.copyWith(id: 'f2').id, 'f2');
    });

    test('copyWith overrides name', () {
      final m = makeModel();
      expect(m.copyWith(name: 'X').name, 'X');
    });

    test('copyWith overrides type', () {
      final m = makeModel();
      expect(m.copyWith(type: FeedType.news).type, FeedType.news);
    });

    test('copyWith overrides isHome', () {
      final m = makeModel();
      expect(m.copyWith(isHome: true).isHome, isTrue);
    });

    test('copyWith overrides isCustom', () {
      final m = makeModel();
      expect(m.copyWith(isCustom: true).isCustom, isTrue);
    });

    test('copyWith overrides subscriptionLevel', () {
      final m = makeModel();
      expect(
        m.copyWith(subscriptionLevelRequired: 5).subscriptionLevelRequired,
        5,
      );
    });

    test('copyWith overrides sorting', () {
      final m = makeModel();
      expect(
        m.copyWith(sorting: SortingRule.following).sorting,
        SortingRule.following,
      );
    });

    test('copyWith overrides refinements', () {
      final m = makeModel();
      const r = FeedRefinements(includeKeywords: ['k']);
      expect(m.copyWith(refinements: r).refinements.includeKeywords, ['k']);
    });

    test('copyWith overrides contentFilters', () {
      final m = makeModel();
      const cf = ContentFilters(allowedTypes: {ContentType.text});
      expect(m.copyWith(contentFilters: cf).contentFilters.allowedTypes, {
        ContentType.text,
      });
    });
  });

  // ── ContentFilters ────────────────────────────────────────────────────
  group('ContentFilters', () {
    test('allows returns true for matching type', () {
      const cf = ContentFilters(allowedTypes: {ContentType.text});
      expect(cf.allows(ContentType.text), isTrue);
    });

    test('allows returns false for non-matching type', () {
      const cf = ContentFilters(allowedTypes: {ContentType.text});
      expect(cf.allows(ContentType.image), isFalse);
    });

    test('allows returns true for mixed', () {
      const cf = ContentFilters(allowedTypes: {ContentType.mixed});
      expect(cf.allows(ContentType.text), isTrue);
      expect(cf.allows(ContentType.image), isTrue);
      expect(cf.allows(ContentType.video), isTrue);
    });
  });

  // ── FeedRefinements ───────────────────────────────────────────────────
  group('FeedRefinements', () {
    test('defaults are empty', () {
      const r = FeedRefinements();
      expect(r.includeKeywords, isEmpty);
      expect(r.excludeKeywords, isEmpty);
      expect(r.includeAccounts, isEmpty);
      expect(r.excludeAccounts, isEmpty);
    });

    test('copyWith overrides includeKeywords', () {
      const r = FeedRefinements();
      final copy = r.copyWith(includeKeywords: ['a', 'b']);
      expect(copy.includeKeywords, ['a', 'b']);
    });

    test('copyWith overrides excludeKeywords', () {
      const r = FeedRefinements();
      final copy = r.copyWith(excludeKeywords: ['c']);
      expect(copy.excludeKeywords, ['c']);
    });

    test('copyWith overrides includeAccounts', () {
      const r = FeedRefinements();
      final copy = r.copyWith(includeAccounts: ['u1']);
      expect(copy.includeAccounts, ['u1']);
    });

    test('copyWith overrides excludeAccounts', () {
      const r = FeedRefinements();
      final copy = r.copyWith(excludeAccounts: ['u2']);
      expect(copy.excludeAccounts, ['u2']);
    });

    test('copyWith preserves unset fields', () {
      const r = FeedRefinements(includeKeywords: ['k'], excludeAccounts: ['a']);
      final copy = r.copyWith(includeKeywords: ['x']);
      expect(copy.includeKeywords, ['x']);
      expect(copy.excludeAccounts, ['a']);
    });
  });

  // ── FeedItem ──────────────────────────────────────────────────────────
  group('FeedItem', () {
    test('stores all required fields', () {
      final item = _makeItem('item-1');
      expect(item.id, 'item-1');
      expect(item.feedId, 'test');
      expect(item.author, 'author');
      expect(item.contentType, ContentType.text);
      expect(item.title, 'Title');
      expect(item.body, 'Body');
    });

    test('optional fields default correctly', () {
      final item = _makeItem('x');
      expect(item.authorId, isNull);
      expect(item.sourceName, isNull);
      expect(item.sourceUrl, isNull);
      expect(item.imageUrl, isNull);
      expect(item.videoThumbnailUrl, isNull);
      expect(item.tags, isEmpty);
      expect(item.isNews, isFalse);
      expect(item.isPinned, isFalse);
    });

    test('custom optional fields', () {
      final item = FeedItem(
        id: 'x',
        feedId: 'f',
        author: 'a',
        authorId: 'aid',
        sourceName: 'src',
        sourceUrl: 'http://src',
        contentType: ContentType.image,
        title: 'T',
        body: 'B',
        publishedAt: DateTime(2025),
        imageUrl: 'http://img',
        videoThumbnailUrl: 'http://vid',
        tags: ['t1', 't2'],
        isNews: true,
        isPinned: true,
      );
      expect(item.authorId, 'aid');
      expect(item.sourceName, 'src');
      expect(item.imageUrl, 'http://img');
      expect(item.videoThumbnailUrl, 'http://vid');
      expect(item.tags, ['t1', 't2']);
      expect(item.isNews, isTrue);
      expect(item.isPinned, isTrue);
    });
  });

  // ── FeedTrustSummary & FeedTrustTimeline ──────────────────────────────
  group('FeedTrustSummary', () {
    test('defaults', () {
      const s = FeedTrustSummary();
      expect(s.trustStatus, 'no_extra_signals');
      expect(s.hasAppeal, isFalse);
      expect(s.proofSignalsProvided, isFalse);
      expect(s.verifiedContextBadgeEligible, isFalse);
      expect(s.featuredEligible, isFalse);
    });

    test('custom values', () {
      const s = FeedTrustSummary(
        trustStatus: 'verified',
        hasAppeal: true,
        proofSignalsProvided: true,
        verifiedContextBadgeEligible: true,
        featuredEligible: true,
      );
      expect(s.trustStatus, 'verified');
      expect(s.hasAppeal, isTrue);
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
        mediaChecked: 'done',
        moderation: 'flagged',
        appeal: 'submitted',
      );
      expect(t.created, 'pending');
      expect(t.appeal, 'submitted');
    });
  });

  // ── Enum values ───────────────────────────────────────────────────────
  group('Enums', () {
    test('FeedType has all values', () {
      expect(FeedType.values.length, 4);
      expect(FeedType.values, contains(FeedType.discover));
      expect(FeedType.values, contains(FeedType.news));
      expect(FeedType.values, contains(FeedType.custom));
      expect(FeedType.values, contains(FeedType.moderation));
    });

    test('ContentType has all values', () {
      expect(ContentType.values.length, 4);
    });

    test('SortingRule has all values', () {
      expect(SortingRule.values.length, 5);
      expect(SortingRule.values, contains(SortingRule.hot));
      expect(SortingRule.values, contains(SortingRule.newest));
      expect(SortingRule.values, contains(SortingRule.relevant));
      expect(SortingRule.values, contains(SortingRule.following));
      expect(SortingRule.values, contains(SortingRule.local));
    });
  });
}

FeedItem _makeItem(String id) {
  return FeedItem(
    id: id,
    feedId: 'test',
    author: 'author',
    contentType: ContentType.text,
    title: 'Title',
    body: 'Body',
    publishedAt: DateTime(2025, 1, 1),
  );
}

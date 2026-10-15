import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/custom_feed_service.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';

import '../../helpers/feed_session.dart';
import '../../helpers/content_recovery.dart';

const _discover = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

FeedModel _custom(String owner) => _discover.copyWith(
  id: 'synthetic-custom-$owner',
  name: 'Synthetic private feed $owner',
  type: FeedType.custom,
);

class _Request {
  _Request(this.token, this.cursor, [this.cancellation]);
  final String? token;
  final String? cursor;
  final FeedRequestCancellation? cancellation;
  final result = Completer<domain.FeedResponse>();

  void complete(List<String> ids, {String? cursor}) => result.complete(
    domain.FeedResponse(
      posts: ids
          .map(
            (id) => domain.Post(
              id: id,
              authorId: 'synthetic-public-author',
              authorUsername: 'Synthetic member',
              text: 'Synthetic post $id',
              createdAt: DateTime.utc(2026, 10, 15),
            ),
          )
          .toList(),
      totalCount: ids.length,
      hasMore: cursor != null,
      nextCursor: cursor,
      page: 1,
      pageSize: 25,
    ),
  );
}

class _Feeds extends Fake implements SocialFeedRepository {
  final requests = <_Request>[];

  @override
  Future<domain.FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
    String? tag,
    FeedRequestCancellation? cancellation,
  }) {
    final request = _Request(token, cursor, cancellation);
    requests.add(request);
    return request.result.future;
  }

  @override
  Future<domain.FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) => getDiscoverFeed(cursor: cursor, limit: limit, token: token);
}

class _CustomFeeds extends Fake implements CustomFeedService {
  final lists = <({String token, Completer<List<FeedModel>> result})>[];
  final requests = <_Request>[];

  @override
  Future<List<FeedModel>> listCustomFeeds({
    required String token,
    int limit = 20,
  }) {
    final result = Completer<List<FeedModel>>();
    lists.add((token: token, result: result));
    return result.future;
  }

  @override
  Future<domain.FeedResponse> getCustomFeedItems({
    required String token,
    required String feedId,
    String? cursor,
    int limit = 25,
  }) {
    final request = _Request(token, cursor);
    requests.add(request);
    return request.result.future;
  }
}

class _Subscriptions extends Fake implements BackendSubscriptionService {
  final requests = <({String token, Completer<SubscriptionStatus> result})>[];

  @override
  Future<SubscriptionStatus> checkStatus({required String token}) {
    final result = Completer<SubscriptionStatus>();
    requests.add((token: token, result: result));
    return result.future;
  }
}

SubscriptionStatus _entitlements(String owner, {bool black = true}) =>
    SubscriptionStatus.fromJson({
      'userId': owner,
      'tier': black ? 'black' : 'free',
      'entitlements': {
        'maxCustomFeeds': black ? 3 : 1,
        'newsBoardAccess': black ? 'full' : 'none',
      },
    });

class _Harness {
  _Harness({String? owner = 'a', Future<String?>? initialToken}) {
    auth = FeedTestAuth(owner == null ? null : feedTestUser(owner));
    tokens = StateProvider<Future<String?>>(
      (_) => initialToken ?? Future.value('synthetic-token-$owner'),
    );
    container = ProviderContainer(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        authStateProvider.overrideWith((_) => auth),
        jwtProvider.overrideWith((ref) => ref.watch(tokens)),
        socialFeedServiceProvider.overrideWithValue(feeds),
        customFeedServiceProvider.overrideWithValue(custom),
        subscriptionServiceProvider.overrideWithValue(subscriptions),
      ],
    );
    addTearDown(container.dispose);
  }

  late final FeedTestAuth auth;
  late final StateProvider<Future<String?>> tokens;
  late final ProviderContainer container;
  final feeds = _Feeds();
  final custom = _CustomFeeds();
  final subscriptions = _Subscriptions();

  LiveFeedState get state => container.read(liveFeedStateProvider(_discover));
  LiveFeedController get controller =>
      container.read(liveFeedStateProvider(_discover).notifier);
  List<String> get ids => state.items.map((item) => item.id).toList();

  void switchTo(String? owner, {Future<String?>? token}) {
    container.read(tokens.notifier).state =
        token ?? Future.value('synthetic-token-$owner');
    auth.change(AsyncData(owner == null ? null : feedTestUser(owner)));
    container.read(tokenVersionProvider.notifier).state++;
  }

  Future<void> flush() async {
    await container.pump();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  Future<void> start() async {
    controller;
    await flush();
  }

  Future<void> loadA({String? cursor = 'cursor-a'}) async {
    await start();
    feeds.requests.single.complete(['a'], cursor: cursor);
    await flush();
    expect(ids, ['a']);
  }
}

Future<GlobalKey> _renderViewer(
  WidgetTester tester,
  _Harness h, {
  AlphaFeedSection section = AlphaFeedSection.discover,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final boundary = GlobalKey();
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: h.container,
      child: MaterialApp(
        theme: LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: RepaintBoundary(key: boundary, child: child!),
        ),
        home: HomeFeedNavigator(section: section),
      ),
    ),
  );
  await tester.pump();
  return boundary;
}

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final output = Platform.environment['LYTHAUS_FEED_EVIDENCE'];
  if (output == null) return;
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fonts = FontLoader('Manrope');
    for (final weight in [
      'Regular',
      'Medium',
      'SemiBold',
      'Bold',
      'ExtraBold',
    ]) {
      fonts.addFont(rootBundle.load('assets/fonts/Manrope-$weight.ttf'));
    }
    await fonts.load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  test('A to B clears loaded cards and cursor before the next frame', () async {
    final h = _Harness();
    await h.loadA();
    final old = h.controller;
    h.switchTo('b');
    expect(old.state.items, isEmpty);
    expect(old.state.nextCursor, isNull);
    expect(h.state.items, isEmpty);
    await h.flush();
    expect(h.feeds.requests.last.token, 'synthetic-token-b');
    expect(h.feeds.requests.last.cursor, isNull);
    h.feeds.requests.last.complete(['b']);
    await h.flush();
    expect(h.ids, ['b']);
    await old.loadMore();
    await old.refresh();
    expect(h.feeds.requests, hasLength(2));
  });

  test(
    'logout clears member data and never sends the stored member token',
    () async {
      final h = _Harness();
      await h.loadA();
      h.switchTo(null, token: Future.value('synthetic-token-a'));
      expect(h.state.items, isEmpty);
      await h.flush();
      expect(h.feeds.requests.last.token, isNull);
      h.feeds.requests.last.complete(['guest-public']);
      await h.flush();
      expect(h.ids, ['guest-public']);
    },
  );

  for (final fails in [false, true]) {
    test('late A ${fails ? 'failure' : 'response'} cannot replace B', () async {
      final h = _Harness();
      await h.start();
      final old = h.feeds.requests.single;
      h.switchTo('b');
      h.controller;
      await h.flush();
      expect(old.cancellation!.isCancelled, isTrue);
      h.feeds.requests.last.complete(['b']);
      await h.flush();
      if (fails) {
        old.result.completeError(StateError('Synthetic obsolete failure'));
      } else {
        old.complete(['a'], cursor: 'obsolete-cursor');
      }
      await h.flush();
      expect(h.ids, ['b']);
      expect(h.state.errorMessage, isNull);
      expect(h.state.nextCursor, isNull);
    });
  }

  test(
    'late credential resolution cannot dispatch an old account request',
    () async {
      final token = Completer<String?>();
      final h = _Harness(initialToken: token.future);
      await h.start();
      expect(h.feeds.requests, isEmpty);
      h.switchTo('b');
      h.controller;
      await h.flush();
      token.complete('synthetic-token-a');
      await h.flush();
      expect(h.feeds.requests, hasLength(1));
      expect(h.feeds.requests.single.token, 'synthetic-token-b');
      h.feeds.requests.single.complete(['b']);
      await h.flush();
      expect(h.ids, ['b']);
    },
  );

  test(
    'A logout A in one event turn never revives the earlier session',
    () async {
      final h = _Harness();
      await h.start();
      final old = h.feeds.requests.single;
      h.switchTo(null);
      h.switchTo('a', token: Future.value('synthetic-token-a-new'));
      old.complete(['old-a']);
      expect(h.state.items, isEmpty);
      await h.flush();
      expect(h.feeds.requests.last.token, 'synthetic-token-a-new');
      h.feeds.requests.last.complete(['new-a']);
      await h.flush();
      expect(h.ids, ['new-a']);
    },
  );

  test(
    'loading, auth errors and missing member credentials fail closed',
    () async {
      final h = _Harness();
      await h.loadA();
      h.auth.change(const AsyncLoading());
      expect(h.state.items, isEmpty);
      await h.flush();
      expect(h.feeds.requests, hasLength(1));
      h.auth.change(
        AsyncError(StateError('Synthetic auth failure'), StackTrace.current),
      );
      h.controller;
      await h.flush();
      expect(h.state.requiresSignIn, isTrue);
      expect(h.ids, isEmpty);
      h.switchTo('b', token: Future.value(null));
      h.controller;
      await h.flush();
      expect(h.state.requiresSignIn, isTrue);
      expect(h.feeds.requests, hasLength(1));
    },
  );

  test(
    'pagination coalesces repeated sends and deduplicates overlapping posts',
    () async {
      final h = _Harness();
      await h.loadA();
      final first = h.controller.loadMore();
      final duplicate = h.controller.loadMore();
      await h.flush();
      expect(h.feeds.requests, hasLength(2));
      expect(h.feeds.requests.last.cursor, 'cursor-a');
      h.feeds.requests.last.complete(['a', 'a2', 'a2'], cursor: 'cursor-a2');
      await Future.wait([first, duplicate]);
      expect(h.ids, ['a', 'a2']);
      expect(h.state.nextCursor, 'cursor-a2');
    },
  );

  test(
    'refresh supersedes pagination and repeated refresh coalesces',
    () async {
      final h = _Harness();
      await h.loadA();
      final paging = h.controller.loadMore();
      await h.flush();
      final page = h.feeds.requests.last;
      final refresh = h.controller.refresh();
      final duplicate = h.controller.refresh();
      await h.flush();
      expect(h.feeds.requests, hasLength(3));
      expect(page.cancellation!.isCancelled, isTrue);
      expect(h.feeds.requests.last.cursor, isNull);
      h.feeds.requests.last.complete(['fresh'], cursor: 'fresh-cursor');
      await Future.wait([refresh, duplicate]);
      page.complete(['obsolete-page'], cursor: 'obsolete-page-cursor');
      await paging;
      expect(h.ids, ['fresh']);
      expect(h.state.nextCursor, 'fresh-cursor');
    },
  );

  test('pagination from A cannot append to the B feed', () async {
    final h = _Harness();
    await h.loadA();
    final pending = h.controller.loadMore();
    await h.flush();
    final old = h.feeds.requests.last;
    h.switchTo('b');
    h.controller;
    await h.flush();
    h.feeds.requests.last.complete(['b']);
    await h.flush();
    old.complete(['a-private-filtered-page'], cursor: 'a-next');
    await pending;
    expect(h.ids, ['b']);
    expect(h.state.nextCursor, isNull);
  });

  for (final status in [401, 403, 404]) {
    test('pagination $status clears cached cards and cursor', () async {
      final h = _Harness();
      await h.loadA();
      final pending = h.controller.loadMore();
      await h.flush();
      h.feeds.requests.last.result.completeError(
        DioException(
          requestOptions: RequestOptions(),
          response: Response(
            requestOptions: RequestOptions(),
            statusCode: status,
          ),
        ),
      );
      await pending;
      expect(h.ids, isEmpty);
      expect(h.state.nextCursor, isNull);
      expect(h.state.errorMessage, isNotNull);
      expect(h.state.requiresSignIn, status == 401);
    });
  }

  test('non-advancing cursors surface an error and can be retried', () async {
    final h = _Harness();
    await h.loadA();
    final invalid = h.controller.loadMore();
    await h.flush();
    h.feeds.requests.last.complete(['discarded'], cursor: 'cursor-a');
    await invalid;
    expect(h.ids, ['a']);
    expect(h.state.errorMessage, 'Unable to load more items.');
    final retry = h.controller.loadMore();
    await h.flush();
    h.feeds.requests.last.complete(['a2'], cursor: 'cursor-a2');
    await retry;
    final cycle = h.controller.loadMore();
    await h.flush();
    h.feeds.requests.last.complete(['discarded-cycle'], cursor: 'cursor-a');
    await cycle;
    expect(h.ids, ['a', 'a2']);
    expect(h.state.errorMessage, isNotNull);
  });

  test('explicit cache invalidation rejects an old completion', () async {
    final h = _Harness();
    await h.start();
    final old = h.feeds.requests.single;
    h.container.invalidate(liveFeedStateProvider(_discover));
    h.controller;
    await h.flush();
    expect(old.cancellation!.isCancelled, isTrue);
    old.complete(['discarded']);
    await h.flush();
    expect(h.ids, isEmpty);
    h.feeds.requests.last.complete(['current']);
    await h.flush();
    expect(h.ids, ['current']);
  });

  test('session changes reset saved positions and feed selection', () async {
    final h = _Harness();
    h.container.read(feedRestoreSnapshotsProvider.notifier).state = {
      'discover': const FeedRestoreSnapshot(
        lastVisibleItemId: 'a-private-id',
        offset: 500,
      ),
    };
    h.container.read(currentFeedIndexProvider.notifier).state = 2;
    h.switchTo('b');
    expect(h.container.read(feedRestoreSnapshotsProvider), isEmpty);
    expect(h.container.read(currentFeedIndexProvider), 0);
  });

  test('custom names and entitlements disappear while B resolves', () async {
    final h = _Harness();
    final listener = h.container.listen(
      feedListProvider,
      (_, _) {},
      fireImmediately: true,
    );
    addTearDown(listener.close);
    await h.flush();
    h.custom.lists.single.result.complete([_custom('a')]);
    h.subscriptions.requests.single.result.complete(_entitlements('a'));
    await h.flush();
    expect(
      h.container.read(feedListProvider).map((f) => f.id),
      contains(_custom('a').id),
    );
    h.switchTo('b');
    expect(h.container.read(feedListProvider).map((f) => f.id), ['discover']);
    await h.flush();
    expect(h.custom.lists.last.token, 'synthetic-token-b');
    expect(h.subscriptions.requests.last.token, 'synthetic-token-b');
    h.custom.lists.last.result.complete([_custom('b')]);
    h.subscriptions.requests.last.result.complete(
      _entitlements('b', black: false),
    );
    await h.flush();
    expect(h.container.read(feedListProvider).map((f) => f.id), [
      'discover',
      _custom('b').id,
    ]);
  });

  test('late custom lists and entitlements cannot publish under B', () async {
    final h = _Harness();
    final listener = h.container.listen(
      feedListProvider,
      (_, _) {},
      fireImmediately: true,
    );
    addTearDown(listener.close);
    await h.flush();
    final oldList = h.custom.lists.single;
    final oldEntitlements = h.subscriptions.requests.single;
    h.switchTo('b');
    h.container.read(feedListProvider);
    await h.flush();
    h.custom.lists.last.result.complete([_custom('b')]);
    h.subscriptions.requests.last.result.complete(
      _entitlements('b', black: false),
    );
    await h.flush();
    oldList.result.complete([_custom('a')]);
    oldEntitlements.result.complete(_entitlements('a'));
    await h.flush();
    expect(h.container.read(feedListProvider).map((f) => f.id), [
      'discover',
      _custom('b').id,
    ]);
  });

  test('session provider invalidation clears dependent content', () async {
    final h = _Harness();
    await h.loadA();
    h.container.invalidate(feedReadSessionProvider);
    expect(h.state.items, isEmpty);
    await h.flush();
    h.feeds.requests.last.complete(['new']);
    await h.flush();
    expect(h.ids, ['new']);
  });

  for (final type in [FeedType.custom, FeedType.news]) {
    test('late ${type.name} response cannot cross accounts', () async {
      final h = _Harness();
      final feed = _discover.copyWith(id: type.name, type: type);
      h.container.read(liveFeedStateProvider(feed));
      await h.flush();
      if (type == FeedType.news) {
        h.subscriptions.requests.single.result.complete(_entitlements('a'));
        await h.flush();
      }
      final requests = type == FeedType.custom
          ? h.custom.requests
          : h.feeds.requests;
      final old = requests.single;
      expect(old.token, 'synthetic-token-a');
      h.switchTo('b');
      expect(h.container.read(liveFeedStateProvider(feed)).items, isEmpty);
      await h.flush();
      if (type == FeedType.news) {
        h.subscriptions.requests.last.result.complete(_entitlements('b'));
        await h.flush();
      }
      expect(requests.last.token, 'synthetic-token-b');
      requests.last.complete(['b']);
      await h.flush();
      old.complete(['a'], cursor: 'a-private-cursor');
      await h.flush();
      final state = h.container.read(liveFeedStateProvider(feed));
      expect(state.items.map((item) => item.id), ['b']);
      expect(state.nextCursor, isNull);
    });
  }

  test('one-shot feed projection cannot return an old viewer result', () async {
    final h = _Harness();
    final oldFuture = h.container.read(liveFeedItemsProvider(_discover).future);
    final oldOutcome = oldFuture.then<Object?>(
      (items) => items.map((item) => item.id).toList(),
      onError: (_) => null,
    );
    await h.flush();
    final old = h.feeds.requests.single;
    h.switchTo('b');
    final current = h.container.read(liveFeedItemsProvider(_discover).future);
    await h.flush();
    h.feeds.requests.last.complete(['b']);
    expect((await current).map((item) => item.id), ['b']);
    old.complete(['a']);
    await h.flush();
    expect(await oldOutcome, isNot(contains('a')));
    expect(
      h.container
          .read(liveFeedItemsProvider(_discover))
          .value
          ?.map((item) => item.id),
      ['b'],
    );
  });

  test('logout invalidates private feed lists and entitlements', () async {
    final h = _Harness();
    final listener = h.container.listen(
      feedListProvider,
      (_, _) {},
      fireImmediately: true,
    );
    addTearDown(listener.close);
    await h.flush();
    h.custom.lists.single.result.complete([_custom('a')]);
    h.subscriptions.requests.single.result.complete(_entitlements('a'));
    await h.flush();
    h.switchTo(null);
    expect(h.container.read(feedListProvider).map((feed) => feed.id), [
      'discover',
    ]);
    await h.flush();
    expect(h.custom.lists, hasLength(1));
    expect(h.subscriptions.requests, hasLength(1));
    expect(await h.container.read(customFeedsProvider.future), isEmpty);
    expect(await h.container.read(feedEntitlementsProvider.future), isNull);
  });

  test(
    'current custom-list failures stay errors, not successful empty lists',
    () async {
      final h = _Harness();
      final future = h.container.read(customFeedsProvider.future);
      final assertion = expectLater(future, throwsA(isA<StateError>()));
      await h.flush();
      h.custom.lists.single.result.completeError(
        StateError('Synthetic offline failure'),
      );
      await assertion;
      expect(h.container.read(customFeedsProvider).hasError, isTrue);
    },
  );

  test('token rotation cancels old work even for the same account', () async {
    final h = _Harness();
    await h.loadA();
    final pending = h.controller.refresh();
    await h.flush();
    final old = h.feeds.requests.last;
    final oldController = h.controller;
    h.container.read(h.tokens.notifier).state = Future.value(
      'synthetic-rotated-token',
    );
    h.container.read(tokenVersionProvider.notifier).state++;
    expect(oldController.state.items, isEmpty);
    h.controller;
    await h.flush();
    expect(old.cancellation!.isCancelled, isTrue);
    expect(h.feeds.requests.last.token, 'synthetic-rotated-token');
    old.complete(['old']);
    h.feeds.requests.last.complete(['new']);
    await pending;
    await h.flush();
    expect(h.ids, ['new']);
  });

  testWidgets(
    'mobile account change clears cards, scroll and open private selector',
    (tester) async {
      final h = _Harness();
      final boundary = await _renderViewer(tester, h);
      h.custom.lists.single.result.complete([_custom('a')]);
      h.subscriptions.requests.single.result.complete(_entitlements('a'));
      h.feeds.requests.single.complete(
        List.generate(20, (i) => 'a-$i'),
        cursor: 'a-page',
      );
      await tester.pumpAndSettle();
      expect(find.text('Synthetic post a-0'), findsOneWidget);
      final oldScroll = tester
          .widget<DiscoverFeed>(find.byType(DiscoverFeed))
          .controller!;
      await tester.drag(find.byType(DiscoverFeed), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(oldScroll.offset, greaterThan(0));
      final feeds = h.container.read(feedListProvider);
      final actualDiscover = feeds.first;
      final pagination = h.container
          .read(liveFeedStateProvider(actualDiscover).notifier)
          .loadMore();
      await tester.pump();
      final oldPage = h.feeds.requests.last;
      tester.widget<LythausTopBar>(find.byType(LythausTopBar)).onTitleTap!();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text(_custom('a').name), findsOneWidget);
      h.switchTo('b');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text(_custom('a').name), findsNothing);
      expect(find.text('Synthetic post a-0'), findsNothing);
      expect(find.text('Loading posts'), findsOneWidget);
      await _capture(tester, boundary, 'session-b-loading-390-light');
      h.custom.lists.last.result.complete([_custom('b')]);
      h.subscriptions.requests.last.result.complete(
        _entitlements('b', black: false),
      );
      h.feeds.requests.last.complete(['b-current']);
      await tester.pumpAndSettle();
      final newScroll = tester
          .widget<DiscoverFeed>(find.byType(DiscoverFeed))
          .controller!;
      expect(identical(oldScroll, newScroll), isFalse);
      expect(newScroll.offset, 0);
      oldPage.complete(['a-late-private']);
      await pagination;
      await tester.pumpAndSettle();
      expect(find.text('Synthetic post b-current'), findsOneWidget);
      expect(find.text('Synthetic post a-late-private'), findsNothing);
      expect(tester.takeException(), isNull);
      await _capture(tester, boundary, 'session-b-late-a-rejected-390-light');
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('mobile logout and credential error never show member cards', (
    tester,
  ) async {
    final h = _Harness();
    final boundary = await _renderViewer(tester, h);
    h.feeds.requests.single.complete(['member-a']);
    await tester.pumpAndSettle();
    expect(find.text('Synthetic post member-a'), findsOneWidget);
    h.switchTo(null, token: Future.value('synthetic-retained-member-token'));
    await tester.pump();
    expect(find.text('Synthetic post member-a'), findsNothing);
    expect(h.feeds.requests.last.token, isNull);
    h.feeds.requests.last.complete(['guest-public']);
    await tester.pumpAndSettle();
    expect(find.text('Synthetic post guest-public'), findsOneWidget);
    h.switchTo('b', token: Future.value(null));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic post guest-public'), findsNothing);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('No posts yet'), findsNothing);
    expect(tester.takeException(), isNull);
    await _capture(tester, boundary, 'session-unverified-390-light');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('private-list failure shows recovery instead of empty success', (
    tester,
  ) async {
    final h = _Harness();
    final boundary = await _renderViewer(
      tester,
      h,
      section: AlphaFeedSection.myFeeds,
    );
    h.custom.lists.single.result.completeError(StateError('Synthetic offline'));
    h.subscriptions.requests.single.result.complete(_entitlements('a'));
    await tester.pumpAndSettle();
    expect(find.text('Couldn’t load your feeds'), findsOneWidget);
    expect(find.text('No custom feeds yet'), findsNothing);
    expect(find.text('Create custom feed'), findsNothing);
    await _capture(tester, boundary, 'private-feeds-offline-390-light');
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(h.custom.lists, hasLength(2));
    h.custom.lists.last.result.complete([]);
    h.subscriptions.requests.last.result.complete(_entitlements('a'));
    await tester.pumpAndSettle();
    expect(find.text('No custom feeds yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

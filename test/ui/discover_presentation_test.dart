import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';

const _feed = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

final _posts = [
  FeedItem(
    id: 'synthetic-post-1',
    feedId: 'discover',
    author: 'Amara Okafor',
    authorId: 'synthetic-author-1',
    contentType: ContentType.text,
    title: 'Update',
    body:
        'The best thing our neighbourhood built this year was a long table. '
        'No programme, no tickets. Just a place to sit and talk.\n\n'
        'What small change has made your community feel more connected?',
    publishedAt: DateTime.utc(2026, 10, 15, 9, 30),
    authorshipLabel: 'Human-authored',
    classificationSource: 'user_disclosure',
  ),
  FeedItem(
    id: 'synthetic-post-2',
    feedId: 'discover',
    author: 'Nia Patel',
    authorId: 'synthetic-author-2',
    contentType: ContentType.text,
    title: 'Update',
    body:
        'A good question can change a conversation. What have you changed your '
        'mind about recently, and what helped you see it differently?',
    publishedAt: DateTime.utc(2026, 10, 14, 15),
    authorshipLabel: 'AI-assisted',
    classificationSource: 'user_disclosure',
  ),
  FeedItem(
    id: 'synthetic-post-3',
    feedId: 'discover',
    author: '01922222-3333-7444-8555-666666666666',
    authorId: '01922222-3333-7444-8555-666666666666',
    contentType: ContentType.text,
    title: 'Update',
    body: 'ADR-003 acceptance fixture',
    publishedAt: DateTime.utc(2026, 10, 13, 10),
    authorshipLabel: 'Human-authored',
    classificationSource: 'user_disclosure',
  ),
];

final _reviewPost = FeedItem(
  id: 'synthetic-review',
  feedId: 'discover',
  author: 'Sam Ellis',
  contentType: ContentType.text,
  title: 'Update',
  body: 'A small idea for a better neighbourhood.',
  publishedAt: DateTime.utc(2026, 10, 15),
  authorshipLabel: 'Human-authored',
  trustSummary: const FeedTrustSummary(
    trustStatus: 'pending_review',
    timeline: FeedTrustTimeline(moderation: 'pending_review'),
  ),
);

Future<GlobalKey> _render(
  WidgetTester tester, {
  required DiscoverFeed feed,
  double width = 390,
  double scale = 1,
  bool dark = false,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final boundary = GlobalKey();
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: dark ? LythausTheme.dark() : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: true,
            textScaler: TextScaler.linear(scale),
          ),
          child: RepaintBoundary(key: boundary, child: child!),
        ),
        home: Scaffold(body: feed),
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

  for (final width in [320.0, 390.0, 1280.0]) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        final name =
            'discover-${width.toInt()}-${dark ? 'dark' : 'light'}-${scale.toInt()}x';
        testWidgets(name, (tester) async {
          final boundary = await _render(
            tester,
            width: width,
            dark: dark,
            scale: scale,
            feed: DiscoverFeed(
              feed: _feed,
              items: _posts,
              onRefresh: () async {},
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.text(_posts.first.body), findsOneWidget);
          expect(
            tester.getSize(find.byType(CustomScrollView)).width,
            lessThanOrEqualTo(760),
          );
          await _capture(tester, boundary, name);
          await tester.scrollUntilVisible(
            find.text('ADR-003 acceptance fixture'),
            400,
          );
          expect(find.text('Lythaus member'), findsOneWidget);
          expect(find.text(_posts.last.authorId!), findsNothing);
          expect(find.textContaining('Assessment:'), findsNothing);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        });
      }

      for (final state in ['empty', 'error', 'loading', 'review']) {
        final name = '$state-${width.toInt()}-${dark ? 'dark' : 'light'}';
        testWidgets(name, (tester) async {
          final boundary = await _render(
            tester,
            width: width,
            dark: dark,
            scale: width == 320 ? 2 : 1,
            feed: DiscoverFeed(
              feed: _feed,
              items: state == 'review' ? [_reviewPost] : const [],
              hasError: state == 'error',
              isRefreshing: state == 'loading',
              onRefresh: () async {},
            ),
          );
          final expected = switch (state) {
            'empty' => 'No public posts yet',
            'error' => 'Couldn’t load posts',
            'loading' => 'Loading posts',
            _ => 'Review pending',
          };
          if (state == 'loading') {
            await tester.pump(const Duration(milliseconds: 300));
          }
          expect(find.text(expected), findsOneWidget);
          expect(find.textContaining('Assessment:'), findsNothing);
          expect(find.text('Created: complete'), findsNothing);
          if (state == 'review') {
            expect(find.text('Authorship: Under review'), findsOneWidget);
          }
          expect(tester.takeException(), isNull);
          await _capture(tester, boundary, name);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        });
      }
    }
  }

  testWidgets('failed updates keep loaded posts and offer recovery', (
    tester,
  ) async {
    await _render(
      tester,
      feed: DiscoverFeed(
        feed: _feed,
        items: [_reviewPost],
        hasError: true,
        onRefresh: () async {},
      ),
    );
    expect(find.byType(FeedCard), findsOneWidget);
    expect(find.text(_reviewPost.body), findsOneWidget);
    expect(find.text('No public posts yet'), findsNothing);
    expect(find.text('Couldn’t update the feed'), findsOneWidget);
  });

  testWidgets('empty feed refresh and error retry work from the keyboard', (
    tester,
  ) async {
    var refreshes = 0;
    for (final error in [false, true]) {
      await _render(
        tester,
        feed: DiscoverFeed(
          feed: _feed,
          items: const [],
          hasError: error,
          onRefresh: () async => refreshes++,
        ),
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(refreshes, error ? 2 : 1);
      final action = find.widgetWithText(
        OutlinedButton,
        error ? 'Retry' : 'Check for posts',
      );
      expect(tester.getSize(action).height, greaterThanOrEqualTo(48));
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets('pagination is keyboard accessible and loading disables it', (
    tester,
  ) async {
    var loads = 0;
    await _render(
      tester,
      feed: DiscoverFeed(
        feed: _feed,
        items: [_reviewPost],
        hasMore: true,
        onLoadMore: () => loads++,
      ),
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(loads, 1);
    await _render(
      tester,
      feed: DiscoverFeed(
        feed: _feed,
        items: [_reviewPost],
        hasMore: true,
        isLoadingMore: true,
        onLoadMore: () => loads++,
      ),
    );
    expect(find.text('Load more posts'), findsNothing);
    expect(find.text('Loading more posts'), findsOneWidget);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -500));
    await tester.pump();
    expect(loads, 1);
  });
}

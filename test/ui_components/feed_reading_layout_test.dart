import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/authorship_disclosure.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/lythaus_bottom_nav.dart';
import 'package:lythaus/ui/components/trust_strip_row.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';

const _feed = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

FeedItem _post(String id, String body) => FeedItem(
  id: id,
  feedId: 'discover',
  author: 'Fixture reader',
  title: 'Everyday',
  contentType: ContentType.text,
  body: body,
  publishedAt: DateTime.utc(2026, 10, 2, 8),
  tags: const ['community'],
);

final _shortPosts = [
  _post(
    'short-1',
    'A quiet morning walk, and a little more time to notice the city.',
  ),
  _post(
    'short-2',
    'The library has a new reading corner. A lovely place to pause.',
  ),
  _post('short-3', 'Good spaces give people enough room to read and respond.'),
];

void _viewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _render(
  WidgetTester tester, {
  required ThemeData theme,
  required Widget body,
  double textScale = 1,
  bool shell = false,
}) {
  return tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: theme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: Scaffold(
          appBar: shell ? AppBar(title: const Text('Discover')) : null,
          body: body,
          bottomNavigationBar: shell
              ? LythausBottomNav(currentIndex: 0, onTap: (_) {})
              : null,
        ),
      ),
    ),
  );
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

  for (final brightness in Brightness.values) {
    final theme = brightness == Brightness.light
        ? LythausTheme.light()
        : LythausTheme.dark();

    for (final height in [844.0, 900.0]) {
      testWidgets('$brightness fits three natural short posts at 390x$height', (
        tester,
      ) async {
        _viewport(tester, Size(390, height));
        await _render(
          tester,
          theme: theme,
          shell: true,
          body: DiscoverFeed(feed: _feed, items: _shortPosts),
        );
        await tester.pumpAndSettle();

        final navigationTop = tester
            .getTopLeft(find.byType(LythausBottomNav))
            .dy;
        expect(
          tester.getBottomLeft(find.byType(FeedCard).at(2)).dy,
          lessThanOrEqualTo(navigationTop),
        );
        for (final post in _shortPosts) {
          expect(find.text(post.body).hitTestable(), findsOneWidget);
        }
        expect(find.text('Authorship: Under review'), findsNWidgets(3));
        for (final button in find.byType(TextButton).evaluate()) {
          final size = tester.getSize(find.byWidget(button.widget));
          expect(size.height, greaterThanOrEqualTo(48));
          expect(size.width, greaterThanOrEqualTo(48));
        }
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('$brightness long posts retain their full natural height', (
      tester,
    ) async {
      _viewport(tester, const Size(390, 900));
      final longBody = List.filled(
        8,
        'Good spaces give people enough room to read and respond.',
      ).join(' ');
      await _render(
        tester,
        theme: theme,
        body: ListView(
          children: [
            FeedCard(item: _shortPosts.first),
            FeedCard(item: _post('long', longBody)),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getSize(find.byType(FeedCard).at(1)).height,
        greaterThan(tester.getSize(find.byType(FeedCard).first).height),
      );
      final text = tester.widget<Text>(find.text(longBody));
      expect(text.maxLines, isNull);
      expect(text.overflow, isNot(TextOverflow.ellipsis));
      expect(tester.takeException(), isNull);
    });

    for (final scale in [1.0, 2.0]) {
      testWidgets(
        '$brightness trust details work at 320px and ${scale}x text',
        (tester) async {
          _viewport(tester, const Size(320, 900));
          var historyOpens = 0;
          await _render(
            tester,
            theme: theme,
            textScale: scale,
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: TrustStripRow(
                summary: const FeedTrustSummary(),
                onTap: () => historyOpens++,
                compact: true,
                leading: const AuthorshipDisclosure(label: 'Under review'),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final details = find.widgetWithText(TextButton, 'Trust details');
          expect(
            find.text('Authorship: Under review').hitTestable(),
            findsOneWidget,
          );
          expect(tester.getSize(details).height, greaterThanOrEqualTo(48));
          expect(find.text('Created: complete'), findsNothing);
          expect(
            tester
                .getSemantics(find.bySemanticsLabel('Trust details').first)
                .getSemanticsData()
                .flagsCollection
                .isExpanded
                .toBoolOrNull(),
            isFalse,
          );

          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          await tester.pump();
          expect(FocusManager.instance.primaryFocus?.hasFocus, isTrue);
          await tester.sendKeyEvent(LogicalKeyboardKey.enter);
          await tester.pumpAndSettle();
          expect(find.text('Created: complete'), findsOneWidget);
          expect(find.text('Media checked: none'), findsOneWidget);
          expect(find.text('Moderation: none'), findsOneWidget);
          expect(find.text('No extra signals'), findsOneWidget);
          expect(find.textContaining('authenticity verified'), findsNothing);
          expect(historyOpens, 0);
          await tester.tap(
            find.bySemanticsLabel(RegExp('^View content history')),
          );
          await tester.pumpAndSettle();
          expect(historyOpens, 1);
          await tester.tap(details);
          await tester.pumpAndSettle();
          expect(find.text('Created: complete'), findsNothing);
          expect(find.text('Authorship: Under review'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );

      testWidgets('$brightness full feed wraps at 320px and ${scale}x text', (
        tester,
      ) async {
        _viewport(tester, const Size(320, 900));
        await _render(
          tester,
          theme: theme,
          textScale: scale,
          body: DiscoverFeed(feed: _feed, items: _shortPosts),
        );
        await tester.pumpAndSettle();
        final first = find.byType(FeedCard).first;
        expect(
          tester.getSize(first).height,
          scale == 1 ? lessThan(250) : greaterThan(250),
        );
        expect(find.text(_shortPosts.first.body), findsOneWidget);
        final details = find.widgetWithText(TextButton, 'Trust details').first;
        await tester.ensureVisible(details);
        await tester.pumpAndSettle();
        await tester.tap(details);
        await tester.pumpAndSettle();
        expect(find.text('Created: complete'), findsOneWidget);
        expect(
          tester
              .getSemantics(find.bySemanticsLabel('Trust details').first)
              .getSemanticsData()
              .flagsCollection
              .isExpanded
              .toBoolOrNull(),
          isTrue,
        );
        expect(find.text('Authorship: Under review'), findsWidgets);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('keyboard focus opens a post and shows a visible focus border', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final theme = LythausTheme.light();
    var postOpens = 0;
    await _render(
      tester,
      theme: theme,
      body: FeedCard(item: _shortPosts.first, onTap: () => postOpens++),
    );
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final surface = tester.widget<Material>(
      find
          .ancestor(
            of: find.text(_shortPosts.first.body),
            matching: find.byType(Material),
          )
          .first,
    );
    final shape = surface.shape! as RoundedRectangleBorder;
    expect(shape.side.color, theme.colorScheme.primary);
    expect(shape.side.width, 2);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(postOpens, 1);
    expect(find.text('Created: complete'), findsNothing);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final parentSurface = tester.widget<Material>(
      find
          .ancestor(
            of: find.text(_shortPosts.first.body),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(
      (parentSurface.shape! as RoundedRectangleBorder).side.color,
      Colors.transparent,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Created: complete'), findsOneWidget);
    expect(postOpens, 1);
    expect(tester.takeException(), isNull);
  });

  for (final entry in {
    'under_appeal': 'Under appeal',
    'actioned': 'Actioned',
    'pending_review': 'pending review',
  }.entries) {
    testWidgets('keeps supplied ${entry.key} state visible before expansion', (
      tester,
    ) async {
      await _render(
        tester,
        theme: LythausTheme.light(),
        body: TrustStripRow(
          compact: true,
          summary: FeedTrustSummary(
            trustStatus: entry.key,
            timeline: const FeedTrustTimeline(
              moderation: 'warn',
              appeal: 'open',
            ),
            hasAppeal: true,
          ),
          onTap: () {},
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(entry.value).hitTestable(), findsOneWidget);
      expect(find.text('Moderation: warn').hitTestable(), findsOneWidget);
      expect(find.text('Appeal: open').hitTestable(), findsOneWidget);
      expect(find.text('Created: complete'), findsNothing);
      expect(find.text('No extra signals'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}

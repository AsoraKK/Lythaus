import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  for (final dark in [false, true]) {
    testWidgets('wordmark alone fits 320px at 200% text, dark=$dark', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(320, 568));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final semantics = tester.ensureSemantics();
      try {
        var feedOpened = false;
        var searchOpened = false;
        var trendingOpened = false;
        await tester.pumpWidget(
          MaterialApp(
            theme: dark ? LythausTheme.dark() : LythausTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(
              appBar: LythausTopBar(
                title: 'Discover',
                useWordmark: true,
                onLogoTap: () => feedOpened = true,
                onSearchTap: () => searchOpened = true,
                onTrendingTap: () => trendingOpened = true,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final brand = tester.widget<LythBrand>(find.byType(LythBrand));
        expect(brand.variant, LythBrandVariant.wordmark);
        expect(brand.height, 32);
        expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
        expect(find.text('Discover'), findsNothing);
        for (final label in ['Feed controls', 'Search', 'Trending']) {
          expect(find.byTooltip(label), findsNothing);
        }
        expect(feedOpened || searchOpened || trendingOpened, isFalse);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }

  testWidgets('single-feed header has no disabled switching affordance', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          appBar: LythausTopBar(title: 'Discover', useWordmark: true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Feed controls'), findsNothing);
    expect(find.text('Discover'), findsNothing);
    expect(find.byType(LythBrand), findsOneWidget);
  });
}

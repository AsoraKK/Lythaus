import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/design_system/theme/lyth_color_schemes.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/design_system/widgets/lyth_wordmark.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  for (final dark in [false, true]) {
    for (final variant in LythBrandVariant.values) {
      testWidgets(
        '$variant approved artwork, dark=$dark, with one accessible label',
        (tester) async {
          final semantics = tester.ensureSemantics();
          try {
            await tester.pumpWidget(
              MaterialApp(
                theme: dark ? LythausTheme.dark() : LythausTheme.light(),
                home: Scaffold(
                  body: Center(child: LythBrand(variant: variant)),
                ),
              ),
            );
            await tester.pumpAndSettle();
            final svg = tester.widget<SvgPicture>(find.byType(SvgPicture));
            final asset = (svg.bytesLoader as SvgAssetLoader).assetName;
            final source = await rootBundle.loadString(asset);
            final fill = RegExp(
              r'fill="#([0-9a-fA-F]{6})"',
            ).firstMatch(source)!;
            final foreground = Color(
              0xFF000000 | int.parse(fill.group(1)!, radix: 16),
            );
            final background =
                (dark ? LythausTheme.dark() : LythausTheme.light())
                    .colorScheme
                    .surface;
            expect(
              LythColorSchemes.contrastRatio(foreground, background),
              greaterThanOrEqualTo(4.5),
            );
            expect(
              asset,
              contains(
                dark
                    ? (variant == LythBrandVariant.symbol
                          ? '-warm.'
                          : '-white.')
                    : '-black.',
              ),
            );
            expect(svg.colorFilter, isNull);
            expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
            expect(tester.getSize(find.byType(SvgPicture)).height, 32);
            expect(tester.takeException(), isNull);
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }

  testWidgets('decorative brand does not duplicate a button action label', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: IconButton(
              onPressed: () {},
              tooltip: 'Feed controls',
              icon: const LythBrand(
                variant: LythBrandVariant.symbol,
                decorative: true,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Lythaus'), findsNothing);
      expect(
        tester.getSemantics(find.byType(IconButton)).getSemanticsData().tooltip,
        'Feed controls',
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
    'wordmark compatibility widget is static even with animations enabled',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: LythWordmark(size: LythWordmarkSize.small)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(LythBrand), findsOneWidget);
      await tester.pump(const Duration(minutes: 5));
      expect(tester.binding.hasScheduledFrame, isFalse);
    },
  );

  testWidgets('onboarding stays scrollable at 320px and double text size', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 568));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var continued = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.dark(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: OnboardingIntroScreen(onContinue: () => continued = true),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    expect(continued, isTrue);
  });
}

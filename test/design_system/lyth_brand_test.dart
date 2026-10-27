import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:lythaus/design_system/theme/lyth_color_schemes.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/design_system/widgets/lyth_wordmark.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  testWidgets('named branding defaults to the standalone approved wordmark', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: LythBrand())),
    );
    await tester.pumpAndSettle();
    final svg = tester.widget<SvgPicture>(find.byType(SvgPicture));
    expect(
      (svg.bytesLoader as SvgAssetLoader).assetName,
      'assets/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg',
    );
    expect(LythBrandVariant.values, [
      LythBrandVariant.symbol,
      LythBrandVariant.wordmark,
    ]);
  });
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
            final source = File(asset).readAsStringSync();
            final viewBox = RegExp(r'viewBox="([^"]+)"')
                .firstMatch(source)!
                .group(1)!
                .split(RegExp(r'\s+'))
                .map(double.parse)
                .toList();
            final size = tester.getSize(find.byType(SvgPicture));
            expect(
              size.width / size.height,
              closeTo(viewBox[2] / viewBox[3], 0.00001),
            );
            const foreground = LythSemanticColors.text;
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
                variant == LythBrandVariant.symbol ? '-warm.' : '-white.',
              ),
            );
            expect(
              svg.colorFilter,
              const ColorFilter.mode(LythSemanticColors.text, BlendMode.srcIn),
            );
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

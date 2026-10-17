import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';

import '../golden_test_utils.dart';

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
    final icons = FontLoader('MaterialIcons');
    icons.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });

  for (final dark in [false, true]) {
    final appearance = dark ? 'dark' : 'light';
    final theme = dark ? LythausTheme.dark() : LythausTheme.light();

    test('$appearance icon focus has an explicit contrasting boundary', () {
      final side = theme.iconButtonTheme.style!.side!;
      expect(side.resolve({}), BorderSide.none);
      final focused = side.resolve({WidgetState.focused})!;
      expect(focused.width, 2);
      expect(
        LythColorSchemes.contrastRatio(
          focused.color,
          theme.colorScheme.surface,
        ),
        greaterThanOrEqualTo(3),
      );
    });

    for (final width in [320.0, 390.0, 1440.0]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets('$appearance header $width at ${scale * 100}% text', (
          tester,
        ) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 600);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          final boundary = GlobalKey();
          final logoFocus = FocusNode();
          final titleFocus = FocusNode();
          addTearDown(logoFocus.dispose);
          addTearDown(titleFocus.dispose);
          final activations = <String>[];
          await tester.pumpWidget(
            MaterialApp(
              theme: theme,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: Scaffold(
                body: RepaintBoundary(
                  key: boundary,
                  child: ColoredBox(
                    color: theme.colorScheme.surface,
                    child: LythausTopBar(
                      title: 'Discover',
                      useWordmark: true,
                      logoFocusNode: logoFocus,
                      titleFocusNode: titleFocus,
                      onLogoTap: () => activations.add('controls'),
                      onTitleTap: () => activations.add('title'),
                      onSearchTap: () => activations.add('search'),
                      onTrendingTap: () => activations.add('trending'),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.byType(LythBrandMark), findsOneWidget);
          expect(find.byType(LythBrandWordmark), findsOneWidget);
          expect(tester.takeException(), isNull);
          expect(
            tester.getSize(find.text('Discover')).height,
            lessThanOrEqualTo(18 * 1.4 * scale + 1),
            reason: 'The section title stays on one line at enlarged text.',
          );
          for (final tooltip in ['Feed controls', 'Search', 'Trending']) {
            final target = find.byTooltip(tooltip);
            expect(target.hitTestable(), findsOneWidget);
            expect(
              tester.getSize(target).shortestSide,
              greaterThanOrEqualTo(48),
            );
          }
          for (final image in tester.widgetList<SvgPicture>(
            find.byType(SvgPicture),
          )) {
            expect(
              image.colorFilter,
              ColorFilter.mode(theme.colorScheme.onSurface, BlendMode.srcIn),
            );
          }
          final wrappedHeader = width < 480 && scale == 2;
          for (var index = 0; index < 4; index++) {
            await tester.sendKeyEvent(LogicalKeyboardKey.tab);
            await tester.pump();
            if (index == 0) expect(logoFocus.hasFocus, isTrue);
            if (index == (wrappedHeader ? 3 : 1)) {
              expect(titleFocus.hasFocus, isTrue);
            }
            await tester.sendKeyEvent(LogicalKeyboardKey.enter);
            await tester.pumpAndSettle();
          }
          expect(
            activations,
            wrappedHeader
                ? ['controls', 'search', 'trending', 'title']
                : ['controls', 'title', 'search', 'trending'],
          );
          expect(tester.takeException(), isNull);

          final evidence = Platform.environment['LYTHAUS_BRAND_EVIDENCE'];
          if (evidence != null) {
            await tester.runAsync(() async {
              final render =
                  boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary;
              final image = await render.toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final directory = Directory(evidence);
              await directory.create(recursive: true);
              await File(
                '$evidence/$appearance-${width.toInt()}-${scale.toInt()}x.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
        });
      }
    }
  }
}

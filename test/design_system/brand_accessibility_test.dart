import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/components/lyth_icon_button.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';

void main() {
  setUpAll(() async {
    final icons = FontLoader('MaterialIcons');
    icons.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });

  for (final dark in [false, true]) {
    final appearance = dark ? 'dark' : 'light';
    final theme = dark ? LythausTheme.dark() : LythausTheme.light();

    for (final brand in <String, Widget>{
      'mark': const LythBrandMark(),
      'wordmark': const LythBrandWordmark(),
    }.entries) {
      testWidgets(
        '$appearance standalone ${brand.key} announces Lythaus once',
        (tester) async {
          final semantics = tester.ensureSemantics();
          try {
            await tester.pumpWidget(
              MaterialApp(
                theme: theme,
                home: Scaffold(body: brand.value),
              ),
            );
            await tester.pumpAndSettle();
            final namedBrand = find.bySemanticsLabel(RegExp(r'^Lythaus$'));
            expect(namedBrand, findsOneWidget);
            final data = tester.getSemantics(namedBrand).getSemanticsData();
            expect(data.flagsCollection.isImage, isTrue);
            expect(data.flagsCollection.isButton, isFalse);
            expect(data.hasAction(ui.SemanticsAction.tap), isFalse);
          } finally {
            semantics.dispose();
          }
        },
      );
    }

    for (final scale in [1.0, 2.0]) {
      testWidgets('$appearance header has distinct action names at ${scale}x', (
        tester,
      ) async {
        final semantics = tester.ensureSemantics();
        try {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(320, 600);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          await tester.pumpWidget(
            MaterialApp(
              theme: theme,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: Scaffold(
                body: LythausTopBar(
                  title: 'Discover',
                  useWordmark: true,
                  onLogoTap: () {},
                  onTitleTap: () {},
                  onSearchTap: () {},
                  onTrendingTap: () {},
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          for (final label in ['Feed controls', 'Search', 'Trending']) {
            final action = find.byTooltip(label);
            expect(action, findsOneWidget);
            final data = tester.getSemantics(action).getSemanticsData();
            expect(data.tooltip, label);
            expect(data.flagsCollection.isButton, isTrue);
            expect(data.hasAction(ui.SemanticsAction.tap), isTrue);
          }
          expect(find.bySemanticsLabel(RegExp('Lythaus')), findsOneWidget);
          final title = tester.getSemantics(find.byType(TextButton));
          expect(title.label, contains('Discover'));
          expect(title.flagsCollection.isButton, isTrue);
          expect(tester.takeException(), isNull);
        } finally {
          semantics.dispose();
        }
      });
    }

    for (final variant in ['standard', 'filled', 'outlined']) {
      testWidgets(
        '$appearance $variant icon focus contrasts on rendered fill',
        (tester) async {
          final semantics = tester.ensureSemantics();
          try {
            var activations = 0;
            final boundary = GlobalKey();
            void activate() => activations++;
            final button = switch (variant) {
              'filled' => LythIconButton.filled(
                icon: Icons.search,
                tooltip: 'Search',
                onPressed: activate,
              ),
              'outlined' => LythIconButton.outlined(
                icon: Icons.search,
                tooltip: 'Search',
                onPressed: activate,
              ),
              _ => LythIconButton(
                icon: Icons.search,
                tooltip: 'Search',
                onPressed: activate,
              ),
            };
            await tester.pumpWidget(
              MaterialApp(
                theme: theme,
                home: Scaffold(
                  body: Center(
                    child: RepaintBoundary(
                      key: boundary,
                      child: ColoredBox(
                        color: theme.colorScheme.surface,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: button,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.pumpAndSettle();
            await tester.sendKeyEvent(LogicalKeyboardKey.tab);
            await tester.pumpAndSettle();
            final action = tester.getSemantics(find.byType(IconButton));
            expect(action.getSemanticsData().tooltip, 'Search');
            expect(action.flagsCollection.isFocused, ui.Tristate.isTrue);
            final material = tester.widget<Material>(
              find.descendant(
                of: find.byType(IconButton),
                matching: find.byType(Material),
              ),
            );
            final side = (material.shape! as OutlinedBorder).side;
            expect(side.width, 2);
            expect(side.strokeAlign, BorderSide.strokeAlignInside);
            final fill = Color.alphaBlend(
              material.color ?? Colors.transparent,
              theme.colorScheme.surface,
            );
            final ink = tester.widget<InkWell>(
              find.descendant(
                of: find.byType(IconButton),
                matching: find.byType(InkWell),
              ),
            );
            final focusedFill = Color.alphaBlend(
              ink.overlayColor?.resolve({WidgetState.focused}) ??
                  Colors.transparent,
              fill,
            );
            final glyph = IconTheme.of(
              tester.element(find.byType(Icon)),
            ).color!;
            for (final background in [fill, focusedFill]) {
              expect(
                LythColorSchemes.contrastRatio(glyph, background),
                greaterThanOrEqualTo(3),
                reason: '$appearance $variant enabled glyph',
              );
            }
            for (final background in [
              if (variant != 'filled') theme.colorScheme.surface,
              fill,
              focusedFill,
            ]) {
              expect(
                LythColorSchemes.contrastRatio(side.color, background),
                greaterThanOrEqualTo(3),
                reason: '$appearance $variant focus boundary',
              );
            }
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
                await Directory(evidence).create(recursive: true);
                await File(
                  '$evidence/$appearance-$variant-focus.png',
                ).writeAsBytes(bytes!.buffer.asUint8List());
                image.dispose();
              });
            }
            await tester.sendKeyEvent(LogicalKeyboardKey.enter);
            await tester.pumpAndSettle();
            expect(activations, 1);
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }
}

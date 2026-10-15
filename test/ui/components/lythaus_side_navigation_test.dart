import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/ui/components/lythaus_side_navigation.dart';

import '../../golden_test_utils.dart';

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
    final icons = FontLoader('MaterialIcons');
    icons.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });

  for (final dark in [false, true]) {
    for (final extended in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        final name =
            '${dark ? 'dark' : 'light'}-${extended ? 'expanded' : 'compact'}-${scale.toInt()}x';
        testWidgets(
          '$name has named, reachable actions and visible keyboard focus',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = const Size(1000, 1000);
            addTearDown(tester.view.resetDevicePixelRatio);
            addTearDown(tester.view.resetPhysicalSize);
            final semantics = tester.ensureSemantics();
            try {
              final theme = dark ? LythausTheme.dark() : LythausTheme.light();
              final calls = <String>[];
              final boundary = GlobalKey();
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
                    body: Align(
                      alignment: Alignment.topLeft,
                      child: RepaintBoundary(
                        key: boundary,
                        child: ColoredBox(
                          color: theme.colorScheme.surface,
                          child: LythausSideNavigation(
                            currentIndex: 0,
                            extended: extended,
                            brand: const Text('Lythaus'),
                            onDestinationSelected: (index) =>
                                calls.add('$index'),
                            onSettings: () => calls.add('settings'),
                            onHelp: () => calls.add('help'),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
              expect(find.bySemanticsLabel('Main navigation'), findsOneWidget);
              expect(
                find.bySemanticsLabel('Settings and help'),
                findsOneWidget,
              );
              for (final label in [
                'Discover',
                'Create',
                'Profile',
                'Rewards',
                'Settings',
                'Help',
              ]) {
                final button = find.widgetWithText(TextButton, label);
                await tester.sendKeyEvent(LogicalKeyboardKey.tab);
                await tester.pumpAndSettle();
                final node = tester.getSemantics(button);
                expect(node.label, label);
                expect(node.flagsCollection.isButton, isTrue);
                expect(node.flagsCollection.isFocused, ui.Tristate.isTrue);
                expect(
                  node.getSemanticsData().hasAction(ui.SemanticsAction.tap),
                  isTrue,
                );
                if (!['Settings', 'Help'].contains(label)) {
                  expect(
                    node.flagsCollection.isSelected,
                    label == 'Discover'
                        ? ui.Tristate.isTrue
                        : ui.Tristate.isFalse,
                  );
                }
                expect(button.hitTestable(), findsOneWidget);
                expect(
                  tester.getSize(button).shortestSide,
                  greaterThanOrEqualTo(48),
                );
                final material = tester.widget<Material>(
                  find.descendant(of: button, matching: find.byType(Material)),
                );
                final side = (material.shape! as OutlinedBorder).side;
                expect(side.width, 2);
                final fill = Color.alphaBlend(
                  material.color ?? Colors.transparent,
                  theme.colorScheme.surface,
                );
                final ink = tester.widget<InkWell>(
                  find.descendant(of: button, matching: find.byType(InkWell)),
                );
                final focusedFill = Color.alphaBlend(
                  ink.overlayColor?.resolve({WidgetState.focused}) ??
                      Colors.transparent,
                  fill,
                );
                for (final background in [
                  theme.colorScheme.surface,
                  fill,
                  focusedFill,
                ]) {
                  expect(
                    LythColorSchemes.contrastRatio(side.color, background),
                    greaterThanOrEqualTo(3),
                  );
                }
                final text = tester.element(
                  find.descendant(of: button, matching: find.text(label)),
                );
                expect(
                  LythColorSchemes.contrastRatio(
                    DefaultTextStyle.of(text).style.color!,
                    focusedFill,
                  ),
                  greaterThanOrEqualTo(4.5),
                );
                await tester.sendKeyEvent(
                  label == 'Help'
                      ? LogicalKeyboardKey.space
                      : LogicalKeyboardKey.enter,
                );
                await tester.pumpAndSettle();
                if (label == 'Discover') {
                  final output = Platform.environment['LYTHAUS_NAV_EVIDENCE'];
                  if (output != null) {
                    await tester.runAsync(() async {
                      final render =
                          boundary.currentContext!.findRenderObject()!
                              as RenderRepaintBoundary;
                      final image = await render.toImage();
                      final bytes = await image.toByteData(
                        format: ui.ImageByteFormat.png,
                      );
                      await Directory(output).create(recursive: true);
                      await File(
                        '$output/$name.png',
                      ).writeAsBytes(bytes!.buffer.asUint8List());
                      image.dispose();
                    });
                  }
                }
              }
              expect(calls, ['0', '1', '2', '3', 'settings', 'help']);
              await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
              await tester.sendKeyEvent(LogicalKeyboardKey.tab);
              await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
              await tester.pumpAndSettle();
              expect(
                tester
                    .getSemantics(find.widgetWithText(TextButton, 'Settings'))
                    .flagsCollection
                    .isFocused,
                ui.Tristate.isTrue,
              );
              expect(tester.takeException(), isNull);
            } finally {
              semantics.dispose();
            }
          },
        );
      }
    }
  }

  testWidgets(
    'short viewport scrolls utilities into view and accepts any brand widget',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1024, 320));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var helped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LythausSideNavigation(
              currentIndex: 2,
              extended: false,
              brand: const Text('Brand slot'),
              onDestinationSelected: (_) {},
              onSettings: () {},
              onHelp: () => helped = true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Brand slot'), findsOneWidget);
      final help = find.widgetWithText(TextButton, 'Help');
      await tester.scrollUntilVisible(help, 100);
      await tester.tap(help);
      await tester.pumpAndSettle();
      expect(helped, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}

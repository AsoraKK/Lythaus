import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/design_system/widgets/lyth_loading_wordmark.dart';

Widget fixture({
  bool active = true,
  bool reduced = false,
  bool ticking = true,
  bool show = true,
  double width = 320,
}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(size: Size(width, 844), disableAnimations: reduced),
    child: TickerMode(
      enabled: ticking,
      child: Center(
        child: SizedBox(
          width: width,
          child: show
              ? LythLoadingWordmark(active: active)
              : const SizedBox.shrink(),
        ),
      ),
    ),
  ),
);

Future<List<int>> pixels(
  WidgetTester tester, {
  Size size = const Size(241, 40),
  CustomPainter? painter,
}) async {
  painter ??= tester
      .widget<CustomPaint>(
        find.descendant(
          of: find.byType(LythLoadingWordmark),
          matching: find.byType(CustomPaint),
        ),
      )
      .painter!;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder)..translate(80, 80);
  painter.paint(canvas, size);
  final picture = recorder.endRecording();
  return (await tester.runAsync(() async {
    final image = await picture.toImage(400, 200);
    final data = await image.toByteData();
    image.dispose();
    picture.dispose();
    return data!.buffer.asUint8List().toList();
  }))!;
}

void main() {
  for (final width in [96.0, 144.0, 200.0, 320.0]) {
    testWidgets('settled artwork matches approved bounds at $width', (
      tester,
    ) async {
      await tester.pumpWidget(fixture(width: width));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1700));
      final size = Size(width, 40);
      final actual = await pixels(tester, size: size);
      final approved = await pixels(
        tester,
        size: size,
        painter: const ApprovedBrandPainter(
          'lythaus-wordmark-white.5ba0451347e2.svg',
        ),
      );
      List<int> bounds(List<int> rgba) {
        var left = 400, top = 200, right = 0, bottom = 0;
        for (var y = 0; y < 200; y++) {
          for (var x = 0; x < 400; x++) {
            if (rgba[(y * 400 + x) * 4 + 3] < 128) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
        return [left, top, right, bottom];
      }

      final expectedBounds = bounds(approved), actualBounds = bounds(actual);
      expect(actualBounds[2] - actualBounds[0], greaterThan(80));
      for (var i = 0; i < 4; i++) {
        expect(actualBounds[i], closeTo(expectedBounds[i], 1));
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets(
    'light repeats at three seconds without darkening revealed letters',
    (tester) async {
      await tester.pumpWidget(fixture());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      final first = await pixels(tester);
      await tester.pump(const Duration(seconds: 3));
      final repeat = await pixels(tester);
      await tester.pump(const Duration(seconds: 3));
      expect(await pixels(tester), repeat);
      expect(first, isNot(repeat));
      await tester.pump(const Duration(milliseconds: 1000));
      final settled = await pixels(tester);
      await tester.pump(const Duration(milliseconds: 700));
      expect(await pixels(tester), settled);
      expect(settled.where((value) => value != 0), isNotEmpty);
      await tester.pumpWidget(fixture(active: false));
      await tester.pumpAndSettle();
      expect(find.byType(LythBrand), findsOneWidget);
      expect(tester.binding.transientCallbackCount, 0);
    },
  );

  testWidgets('lifecycle and ticker mode pause then resume without catch-up', (
    tester,
  ) async {
    await tester.pumpWidget(fixture());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1700));
    final before = await pixels(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pump(const Duration(seconds: 10));
    expect(await pixels(tester), before);
    expect(tester.binding.transientCallbackCount, 0);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(await pixels(tester), before);
    await tester.pumpWidget(fixture(ticking: false));
    await tester.pump(const Duration(seconds: 10));
    expect(tester.binding.transientCallbackCount, 0);
    await tester.pumpWidget(fixture());
    await tester.pump();
    expect(tester.binding.transientCallbackCount, 1);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 10));
    expect(tester.binding.transientCallbackCount, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'reduced motion changes stop all ticks and preserve one image label',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(fixture());
        await tester.pump(const Duration(milliseconds: 600));
        expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
        await tester.pumpWidget(fixture(reduced: true));
        await tester.pumpAndSettle();
        expect(find.byType(LythBrand), findsOneWidget);
        expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
        expect(tester.binding.transientCallbackCount, 0);
        await tester.pumpWidget(fixture());
        await tester.pump();
        final resumed = await pixels(tester);
        await tester.pump(const Duration(milliseconds: 1700));
        expect(await pixels(tester), resumed);
        await tester.pump(const Duration(milliseconds: 1800));
        final resumedSweep = await pixels(tester);
        expect(resumedSweep, isNot(resumed));
        await tester.pump(const Duration(seconds: 3));
        expect(await pixels(tester), resumedSweep);
        expect(tester.binding.transientCallbackCount, 1);
        await tester.pumpWidget(const SizedBox.shrink());
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets('enabling motion after a static launch keeps the wordmark', (
    tester,
  ) async {
    await tester.pumpWidget(fixture(reduced: true));
    expect(find.byType(LythBrand), findsOneWidget);
    await tester.pumpWidget(fixture());
    await tester.pump();
    final resumed = await pixels(tester);
    await tester.pump(const Duration(milliseconds: 1700));
    expect(await pixels(tester), resumed);
  });

  testWidgets('reduced motion presents one final frame and then stops', (
    tester,
  ) async {
    await tester.pumpWidget(fixture());
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpWidget(fixture(reduced: true));
    expect(tester.binding.transientCallbackCount, 0);
    expect(tester.binding.hasScheduledFrame, isTrue);
    await tester.pump();
    expect(tester.binding.hasScheduledFrame, isFalse);
    await tester.pump(const Duration(seconds: 4));
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(tester.binding.transientCallbackCount, 0);
  });

  for (final dispose in [false, true]) {
    testWidgets('no recurring frame after ${dispose ? 'disposal' : 'ready'}', (
      tester,
    ) async {
      await tester.pumpWidget(fixture());
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpWidget(fixture(reduced: true));
      await tester.pumpWidget(
        dispose
            ? fixture(show: false, reduced: true)
            : fixture(active: false, reduced: true),
      );
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.binding.transientCallbackCount, 0);
      await tester.pump(const Duration(seconds: 4));
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    });
  }

  for (final width in [144.0, 320.0, 390.0, 1440.0]) {
    testWidgets('brand slot stays stable at width $width', (tester) async {
      await tester.pumpWidget(fixture(width: width));
      final active = tester.getRect(find.byType(LythLoadingWordmark));
      await tester.pumpWidget(fixture(active: false, width: width));
      await tester.pumpAndSettle();
      expect(tester.getRect(find.byType(LythLoadingWordmark)), active);
      expect(active.height, 40);
      expect(tester.takeException(), isNull);
    });
  }
}

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/ui/components/feed_swipe_region.dart';

void main() {
  Future<void> surface(
    WidgetTester tester,
    List<int> steps,
    List<bool> menus, {
    Widget? child,
    bool accessible = false,
  }) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(
            size: const Size(390, 844),
            accessibleNavigation: accessible,
          ),
          child: Scaffold(
            body: FeedSwipeRegion(
              onFeedStep: steps.add,
              onOpenMenu: () => menus.add(true),
              child:
                  child ??
                  const SizedBox.expand(child: ColoredBox(color: Colors.white)),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('central touch commits once; right inset opens only the menu', (
    tester,
  ) async {
    final steps = <int>[];
    final menus = <bool>[];
    await surface(tester, steps, menus);
    await tester.dragFrom(const Offset(230, 300), const Offset(-110, 0));
    expect(steps, [1]);
    expect(menus, isEmpty);
    await tester.dragFrom(const Offset(355, 300), const Offset(-110, 0));
    expect(steps, [1]);
    expect(menus, [true]);
    await tester.dragFrom(const Offset(110, 300), const Offset(110, 0));
    expect(steps, [1, -1]);
  });

  testWidgets(
    'outer edges, mouse, short, diagonal and cancelled touch do nothing',
    (tester) async {
      final steps = <int>[];
      final menus = <bool>[];
      await surface(tester, steps, menus);
      for (final x in [5.0, 385.0]) {
        await tester.dragFrom(Offset(x, 300), Offset(x < 10 ? 110 : -110, 0));
      }
      await tester.dragFrom(const Offset(230, 300), const Offset(-35, 0));
      await tester.dragFrom(const Offset(230, 300), const Offset(-110, 90));
      final mouse = await tester.startGesture(
        const Offset(230, 300),
        kind: PointerDeviceKind.mouse,
      );
      await mouse.moveBy(const Offset(-110, 0));
      await mouse.up();
      final cancelled = await tester.startGesture(const Offset(230, 300));
      await cancelled.moveBy(const Offset(-110, 0));
      await cancelled.cancel();
      expect(steps, isEmpty);
      expect(menus, isEmpty);
    },
  );

  testWidgets(
    'multi-touch, long press and excluded controls cannot switch feeds',
    (tester) async {
      final steps = <int>[];
      final menus = <bool>[];
      await surface(tester, steps, menus);
      final first = await tester.startGesture(
        const Offset(230, 300),
        pointer: 1,
      );
      final second = await tester.startGesture(
        const Offset(270, 350),
        pointer: 2,
      );
      await first.moveBy(const Offset(-110, 0));
      await second.up();
      await first.up();
      final held = await tester.startGesture(const Offset(230, 300));
      await held.moveBy(
        const Offset(-110, 0),
        timeStamp: const Duration(milliseconds: 900),
      );
      await held.up(timeStamp: const Duration(milliseconds: 1000));
      expect(steps, isEmpty);
      await surface(
        tester,
        steps,
        menus,
        child: const FeedSwipeExclusion(
          child: SizedBox.expand(child: ColoredBox(color: Colors.white)),
        ),
      );
      await tester.dragFrom(const Offset(230, 300), const Offset(-110, 0));
      expect(steps, isEmpty);
    },
  );

  testWidgets('a vertical scroll that wins cannot become a feed gesture', (
    tester,
  ) async {
    final steps = <int>[];
    final menus = <bool>[];
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    await surface(
      tester,
      steps,
      menus,
      child: ListView(
        controller: scroll,
        children: List.generate(
          20,
          (i) => SizedBox(height: 100, child: Text('Post $i')),
        ),
      ),
    );
    final gesture = await tester.startGesture(const Offset(250, 400));
    await gesture.moveBy(const Offset(-50, -10));
    await gesture.moveBy(const Offset(-50, -20));
    await gesture.moveBy(const Offset(-50, -20));
    await gesture.up();
    expect(scroll.offset, greaterThan(0));
    expect(steps, isEmpty);
  });

  testWidgets('accessible navigation retains buttons without optional swipes', (
    tester,
  ) async {
    final steps = <int>[];
    final menus = <bool>[];
    await surface(tester, steps, menus, accessible: true);
    await tester.dragFrom(const Offset(230, 300), const Offset(-110, 0));
    await tester.dragFrom(const Offset(355, 300), const Offset(-110, 0));
    expect(steps, isEmpty);
    expect(menus, isEmpty);
  });

  testWidgets(
    'buttons and text editing keep their own horizontal interaction',
    (tester) async {
      final steps = <int>[];
      final menus = <bool>[];
      await surface(
        tester,
        steps,
        menus,
        child: Column(
          children: [
            SizedBox(
              height: 120,
              width: double.infinity,
              child: TextButton(
                onPressed: () {},
                child: const Text('Post action'),
              ),
            ),
            const TextField(),
            const Expanded(
              child: ColoredBox(color: Colors.white, child: SizedBox.expand()),
            ),
          ],
        ),
      );
      await tester.dragFrom(const Offset(230, 70), const Offset(-110, 0));
      expect(steps, isEmpty);
      await tester.tap(find.byType(TextField));
      await tester.pump();
      await tester.dragFrom(const Offset(355, 400), const Offset(-110, 0));
      expect(menus, isEmpty);
    },
  );
}

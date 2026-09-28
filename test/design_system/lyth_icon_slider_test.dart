import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/components/lyth_icon_button.dart';
import 'package:lythaus/design_system/components/lyth_slider.dart';
import 'package:lythaus/design_system/index.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: LythausTheme.light(),
      home: Scaffold(body: Center(child: child)),
    );
  }

  for (final outlined in [false, true]) {
    for (final enabled in [false, true]) {
      testWidgets('icon variant $outlined supports keyboard when $enabled', (
        tester,
      ) async {
        var activations = 0;
        void activate() => activations++;
        await tester.pumpWidget(
          wrap(
            outlined
                ? LythIconButton.outlined(
                    icon: Icons.bookmark_outline,
                    tooltip: 'Save post',
                    onPressed: enabled ? activate : null,
                  )
                : LythIconButton.filled(
                    icon: Icons.bookmark_outline,
                    tooltip: 'Save post',
                    onPressed: enabled ? activate : null,
                  ),
          ),
        );
        await tester.pumpAndSettle();
        final button = find.byType(IconButton);
        expect(find.byTooltip('Save post'), findsOneWidget);
        expect(tester.getSize(button).width, greaterThanOrEqualTo(48));
        expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
        await tester.sendKeyEvent(LogicalKeyboardKey.space);
        await tester.pumpAndSettle();
        expect(activations, enabled ? 1 : 0);
      });
    }
  }

  testWidgets('LythIconButton shows tooltip and reacts to taps', (
    tester,
  ) async {
    var triggered = false;
    await tester.pumpWidget(
      wrap(
        LythIconButton(
          icon: Icons.star,
          tooltip: 'Favorite',
          onPressed: () => triggered = true,
        ),
      ),
    );

    await tester.pumpAndSettle();
    final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
    expect(tooltip.message, 'Favorite');
    await tester.tap(find.byType(IconButton));
    expect(triggered, isTrue);
  });

  testWidgets('LythIconButton disabled renders null onPressed', (tester) async {
    await tester.pumpWidget(
      wrap(LythIconButton(icon: Icons.close, onPressed: () {}, disabled: true)),
    );

    await tester.pumpAndSettle();
    final button = tester.widget<IconButton>(find.byType(IconButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('LythSlider displays label and updates value', (tester) async {
    double sliderValue = 20;
    await tester.pumpWidget(
      wrap(
        StatefulBuilder(
          builder: (context, setState) {
            return LythSlider(
              value: sliderValue,
              min: 0,
              max: 100,
              divisions: 10,
              label: 'Volume',
              onChanged: (value) => setState(() => sliderValue = value),
            );
          },
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Volume'), findsOneWidget);
    expect(find.text('20'), findsOneWidget);

    final slider = tester.widget<Slider>(find.byType(Slider));
    slider.onChanged?.call(40);
    await tester.pumpAndSettle();
    expect(sliderValue, 40);
    expect(find.text('40'), findsOneWidget);
  });

  testWidgets('LythRangeSlider shows range label and triggers onChanged', (
    tester,
  ) async {
    var range = const RangeValues(10, 40);
    await tester.pumpWidget(
      wrap(
        StatefulBuilder(
          builder: (context, setState) {
            return LythRangeSlider(
              values: range,
              min: 0,
              max: 100,
              label: 'Range',
              onChanged: (values) => setState(() => range = values),
            );
          },
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Range'), findsOneWidget);
    expect(find.text('10 - 40'), findsOneWidget);

    final rangeSlider = tester.widget<RangeSlider>(find.byType(RangeSlider));
    rangeSlider.onChanged?.call(const RangeValues(20, 60));
    await tester.pumpAndSettle();
    expect(range.start, 20);
    expect(range.end, 60);
    expect(find.text('20 - 60'), findsOneWidget);
  });
}

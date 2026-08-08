import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/components/lyth_chip.dart';
import 'package:lythaus/design_system/index.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: LythausTheme.light(),
      home: Scaffold(body: Center(child: child)),
    );
  }

  testWidgets('LythCard returns plain container when not clickable', (
    tester,
  ) async {
    await tester.pumpWidget(wrap(const LythCard(child: Text('Static card'))));

    await tester.pumpAndSettle();
    expect(find.byType(InkWell), findsNothing);
    expect(find.text('Static card'), findsOneWidget);
  });

  testWidgets('LythCard.clickable wraps InkWell and reacts to taps', (
    tester,
  ) async {
    var tapped = false;
    await tester.pumpWidget(
      wrap(
        LythCard.clickable(
          child: const Text('Tap card'),
          onTap: () => tapped = true,
        ),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.byType(InkWell));
    expect(tapped, isTrue);
  });

  testWidgets('LythChip.filter renders FilterChip and calls onSelected', (
    tester,
  ) async {
    var selected = false;
    await tester.pumpWidget(
      wrap(
        LythChip.filter(
          label: 'Filter',
          selected: false,
          onSelected: (value) => selected = value,
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.byType(FilterChip), findsOneWidget);
    await tester.tap(find.byType(FilterChip));
    expect(selected, isTrue);
  });

  testWidgets('LythChip.input renders InputChip and calls onDeleted', (
    tester,
  ) async {
    var deleted = false;
    await tester.pumpWidget(
      wrap(LythChip.input(label: 'Input', onDeleted: () => deleted = true)),
    );

    await tester.pumpAndSettle();
    final chip = tester.widget<InputChip>(find.byType(InputChip));
    chip.onDeleted!();
    expect(deleted, isTrue);
  });

  testWidgets('LythChip defaults to static Chip when no callbacks', (
    tester,
  ) async {
    await tester.pumpWidget(wrap(const LythChip(label: 'Static')));

    await tester.pumpAndSettle();
    expect(find.byType(Chip), findsOneWidget);
  });
}

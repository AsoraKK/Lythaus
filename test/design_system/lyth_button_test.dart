import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';

void main() {
  const label = 'Continue';

  Widget wrap(Widget child) {
    return MaterialApp(
      theme: LythausTheme.light(),
      home: Scaffold(body: Center(child: child)),
    );
  }

  testWidgets('primary button renders ElevatedButton and responds to taps', (
    tester,
  ) async {
    var tapped = false;
    await tester.pumpWidget(
      wrap(LythButton.primary(label: label, onPressed: () => tapped = true)),
    );

    await tester.pump();
    expect(find.byType(ElevatedButton), findsOneWidget);
    await tester.tap(find.byType(ElevatedButton));
    expect(tapped, isTrue);
    expect(find.text(label), findsOneWidget);
  });

  testWidgets('secondary variant uses OutlinedButton', (tester) async {
    await tester.pumpWidget(
      wrap(LythButton.secondary(label: 'Cancel', onPressed: () {})),
    );

    await tester.pump();
    expect(find.byType(OutlinedButton), findsOneWidget);
  });

  testWidgets('loading state replaces label with progress indicator', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(LythButton(label: 'Saving', onPressed: () {}, isLoading: true)),
    );

    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Saving'), findsNothing);
  });

  testWidgets('iconAfter renders icon after label', (tester) async {
    await tester.pumpWidget(
      wrap(
        LythButton(
          label: 'Upload',
          icon: Icons.cloud_upload,
          iconAfter: true,
          onPressed: () {},
        ),
      ),
    );

    await tester.pumpAndSettle();
    final row = tester.widget<Row>(
      find.descendant(
        of: find.byType(ElevatedButton),
        matching: find.byType(Row),
      ),
    );

    expect(row.children.first, isA<Text>());
    expect(row.children.last, isA<Icon>());
  });

  testWidgets('tooltip wraps button when provided', (tester) async {
    await tester.pumpWidget(
      wrap(LythButton(label: 'Info', onPressed: () {}, tooltip: 'More info')),
    );

    await tester.pumpAndSettle();
    expect(find.byType(Tooltip), findsOneWidget);
    expect(find.text('More info'), findsNothing);
  });
}

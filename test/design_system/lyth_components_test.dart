import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/design_system/index.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('LythWordmarkStatic uses onSurface color', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        // Use LythWordmarkStatic to avoid timer issues in tests
        home: const Scaffold(body: Center(child: LythWordmarkStatic())),
      ),
    );
    await tester.pump();

    // LythWordmarkStatic has a single text widget (no glow layer)
    expect(find.text('Lyt haus'), findsOneWidget);

    final context = tester.element(find.byType(LythWordmarkStatic));
    final expectedColor = Theme.of(
      context,
    ).colorScheme.onSurface.withValues(alpha: 0.9);

    final text = tester.widget<Text>(find.text('Lyt haus'));
    expect(text.style?.color, expectedColor);
  });

  testWidgets('LythButton primary uses colorScheme.primary', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: Center(
            child: LythButton.primary(label: 'Continue', onPressed: () {}),
          ),
        ),
      ),
    );
    await tester.pump();

    final element = tester.element(find.byType(ElevatedButton));
    final scheme = Theme.of(element).colorScheme;
    final style = ElevatedButtonTheme.of(element).style;
    final background = style?.backgroundColor?.resolve(<WidgetState>{});

    expect(background, scheme.primary);
  });

  testWidgets('LythButton shows icon before label by default', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: Center(
            child: LythButton.secondary(
              label: 'Secure',
              icon: Icons.lock,
              onPressed: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Secure'), findsOneWidget);
    expect(find.byIcon(Icons.lock), findsOneWidget);

    final row = tester.widget<Row>(
      find.descendant(
        of: find.byType(OutlinedButton),
        matching: find.byType(Row),
      ),
    );
    expect(row.children.first, isA<Icon>());
  });

  testWidgets('LythButton supports iconAfter layout', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: Center(
            child: LythButton.secondary(
              label: 'Next',
              icon: Icons.arrow_forward,
              iconAfter: true,
              onPressed: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final row = tester.widget<Row>(
      find.descendant(
        of: find.byType(OutlinedButton),
        matching: find.byType(Row),
      ),
    );
    expect(row.children.first, isA<Text>());
  });

  testWidgets('LythButton loading replaces label with spinner', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          body: Center(
            child: LythButton(
              label: 'Loading',
              variant: LythButtonVariant.primary,
              isLoading: true,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Loading'), findsNothing);
  });
}

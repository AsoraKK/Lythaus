import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/index.dart';

void main() {
  testWidgets('LythSnackbar success uses surface colors', (tester) async {
    final theme = LythausTheme.light();
    late BuildContext capturedContext;

    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        home: Scaffold(
          body: Builder(
            builder: (context) {
              capturedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    LythSnackbar.success(context: capturedContext, message: 'Saved');
    await tester.pump();

    expect(find.text('Saved'), findsOneWidget);
    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.backgroundColor, theme.colorScheme.surface);
  });

  testWidgets('LythSnackbar error shows action and error color', (
    tester,
  ) async {
    final theme = LythausTheme.light();
    late BuildContext capturedContext;

    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        home: Scaffold(
          body: Builder(
            builder: (context) {
              capturedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    LythSnackbar.error(
      context: capturedContext,
      message: 'Failed',
      action: SnackBarAction(label: 'Retry', onPressed: () {}),
    );
    await tester.pump();

    expect(find.text('Failed'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.backgroundColor, theme.colorScheme.error);
  });

  testWidgets('LythSnackbar info uses surface container color', (tester) async {
    final theme = LythausTheme.light();
    late BuildContext capturedContext;

    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        home: Scaffold(
          body: Builder(
            builder: (context) {
              capturedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    LythSnackbar.info(context: capturedContext, message: 'Heads up');
    await tester.pump();

    expect(find.text('Heads up'), findsOneWidget);
    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.backgroundColor, theme.colorScheme.surfaceContainer);
  });

  testWidgets('LythSnackbar warning uses surface color', (tester) async {
    final theme = LythausTheme.light();
    late BuildContext capturedContext;

    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        home: Scaffold(
          body: Builder(
            builder: (context) {
              capturedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    LythSnackbar.warning(context: capturedContext, message: 'Careful');
    await tester.pump();

    expect(find.text('Careful'), findsOneWidget);
    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.backgroundColor, theme.colorScheme.surface);
  });
}

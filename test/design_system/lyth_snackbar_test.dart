import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/index.dart';

void main() {
  testWidgets('LythSnackbar success uses semantic feedback colors', (
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

    LythSnackbar.success(context: capturedContext, message: 'Saved');
    await tester.pump();

    expect(find.text('Saved'), findsOneWidget);
    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(
      snackBar.backgroundColor,
      LythSemanticColors.light['successSurface'],
    );
    expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
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
    expect(snackBar.backgroundColor, theme.colorScheme.errorContainer);
    expect(snackBar.action?.textColor, theme.colorScheme.onErrorContainer);
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
    expect(snackBar.backgroundColor, LythSemanticColors.light['infoSurface']);
    expect(find.byIcon(Icons.info_outline), findsOneWidget);
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
    expect(
      snackBar.backgroundColor,
      LythSemanticColors.light['warningSurface'],
    );
    expect(find.byIcon(Icons.warning_amber_outlined), findsOneWidget);
  });
}

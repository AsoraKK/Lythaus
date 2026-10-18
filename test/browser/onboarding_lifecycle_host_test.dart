import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

import 'onboarding_lifecycle_host.dart';

void main() {
  testWidgets('diagnostic host retains actual onboarding and Continue marker', (
    tester,
  ) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    final underlyingFocus = FocusNode();
    addTearDown(underlyingFocus.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        builder: (context, child) =>
            OnboardingLifecycleHost(child: FocusTraversalGroup(child: child!)),
        home: Scaffold(
          body: TextButton(
            focusNode: underlyingFocus,
            onPressed: () {},
            child: const Text('Underlying app stays mounted'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(OnboardingIntroScreen), findsOneWidget);
    expect(find.text('Underlying app stays mounted'), findsNothing);
    expect(
      find.text('Underlying app stays mounted', skipOffstage: false),
      findsOneWidget,
    );
    expect(find.text('Synthetic continuation completed'), findsNothing);
    expect(underlyingFocus.canRequestFocus, isFalse);
    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic continuation completed'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

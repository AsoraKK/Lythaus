import 'package:lythaus/screens/lock_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const policyLines = [
    'AI-generated or AI-edited media cannot be posted.',
    'AI-generated text is allowed up to 250 user-perceived characters.',
    'Posts may remain under review until publication checks are complete.',
    'Appeal outcomes are recorded by Lythaus.',
    'This is an invite-only Alpha.',
  ];

  testWidgets('onboarding intro avoids authorship mode copy', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: OnboardingIntroScreen()));

    for (final line in policyLines) {
      expect(find.text(line), findsOneWidget);
    }
    expect(find.textContaining('Human-authored'), findsNothing);
    expect(find.textContaining('AI-assisted'), findsNothing);
  });

  testWidgets('first post lock screen avoids authorship mode copy', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: FirstPostLockScreen())),
    );

    for (final line in policyLines) {
      expect(find.text(line), findsOneWidget);
    }
    expect(find.textContaining('Human-authored'), findsNothing);
    expect(find.textContaining('AI-assisted'), findsNothing);
  });
}

import 'package:lythaus/screens/lock_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const policyLines = [
    'Choose Human-authored or AI-assisted before posting.',
    'AI-generated public content cannot be posted.',
    'AI-assisted public text is limited to 249 user-perceived characters.',
    'Disclosure conflicts may enter Under review.',
    'Appeal outcomes are recorded by Lythaus.',
    'This is an invite-only Alpha.',
  ];

  testWidgets('onboarding intro shows moderation policy copy', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: OnboardingIntroScreen()));

    for (final line in policyLines) {
      expect(find.text(line), findsOneWidget);
    }
  });

  testWidgets('first post lock screen shows moderation policy copy', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: FirstPostLockScreen())),
    );

    for (final line in policyLines) {
      expect(find.text(line), findsOneWidget);
    }
  });
}

import 'package:lythaus/screens/lock_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const policyLines = [
    'Choose an authorship disclosure before posting.',
    'AI-generated posts are labeled and do not earn reputation.',
    'Disclosure conflicts may enter Under review.',
    'Community appeal votes are advisory; moderators make final decisions.',
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

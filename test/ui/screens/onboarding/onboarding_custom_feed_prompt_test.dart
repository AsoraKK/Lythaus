/// Widget tests for OnboardingCustomFeedPrompt.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_custom_feed_prompt.dart';

Widget _buildApp() {
  return ProviderScope(
    overrides: [
      customFeedDraftProvider.overrideWith((ref) => CustomFeedDraftNotifier()),
    ],
    child: const MaterialApp(home: OnboardingCustomFeedPrompt()),
  );
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  group('OnboardingCustomFeedPrompt', () {
    testWidgets('shows "Custom feed" AppBar title', (tester) async {
      await tester.pumpWidget(_buildApp());
      await tester.pump();

      expect(find.text('Custom feed'), findsOneWidget);
    });

    testWidgets('shows "Craft your home feed" headline', (tester) async {
      await tester.pumpWidget(_buildApp());
      await tester.pump();

      expect(find.text('Craft your home feed'), findsOneWidget);
    });

    testWidgets('shows body description text', (tester) async {
      await tester.pumpWidget(_buildApp());
      await tester.pump();

      expect(find.textContaining('Layer content types'), findsOneWidget);
    });
  });
}

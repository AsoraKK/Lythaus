/// Widget tests for ModerationCaseScreen.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/screens/mod/moderation_case.dart';

final _fakeCase = ModerationCase(
  id: 'case-1',
  anonymizedContent: 'Suspicious content snippet for review.',
  reason: 'Hate speech',
  aiConfidence: 0.87,
  decision: ModerationDecision.pending,
  submittedAt: DateTime.utc(2024),
);

Widget _buildApp({String? caseId}) {
  return ProviderScope(
    overrides: [
      moderationQueueProvider.overrideWith((ref) => [_fakeCase]),
    ],
    child: MaterialApp(home: ModerationCaseScreen(caseId: caseId)),
  );
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  group('ModerationCaseScreen', () {
    testWidgets('shows "Moderation Case" AppBar title', (tester) async {
      await tester.pumpWidget(_buildApp(caseId: 'case-1'));
      await tester.pumpAndSettle();

      expect(find.text('Moderation Case'), findsOneWidget);
    });

    testWidgets('renders anonymized content in Context section', (
      tester,
    ) async {
      await tester.pumpWidget(_buildApp(caseId: 'case-1'));
      await tester.pumpAndSettle();

      expect(
        find.text('Suspicious content snippet for review.'),
        findsAtLeastNWidgets(1),
      );
    });

    testWidgets('shows Context heading', (tester) async {
      await tester.pumpWidget(_buildApp(caseId: 'case-1'));
      await tester.pumpAndSettle();

      expect(find.text('Context'), findsOneWidget);
    });

    testWidgets('falls back to queue.first when caseId not matched', (
      tester,
    ) async {
      await tester.pumpWidget(_buildApp(caseId: 'unknown-id'));
      await tester.pumpAndSettle();

      // Should fall back to _fakeCase
      expect(
        find.text('Suspicious content snippet for review.'),
        findsAtLeastNWidgets(1),
      );
    });
  });
}

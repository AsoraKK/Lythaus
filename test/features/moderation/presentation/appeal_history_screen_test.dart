import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';

void main() {
  testWidgets('AppealHistoryScreen directs users to private account activity', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: AppealHistoryScreen()),
      ),
    );

    expect(find.text('Appeals'), findsOneWidget);
    expect(
      find.text('Appeal records live in account activity'),
      findsOneWidget,
    );
    expect(
      find.text(
        'Lythaus records appeal state and outcomes. New appeals are '
        'available only from an eligible resolved moderation case.',
      ),
      findsOneWidget,
    );
    expect(find.text('View account activity'), findsOneWidget);
  });

  testWidgets('AppealHistoryScreen opens the private reputation activity view', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          reputationLedgerPageProvider(null).overrideWith(
            (ref) async => const CursorPage<LedgerEntry>(items: []),
          ),
          activityPageProvider(null).overrideWith(
            (ref) async => const CursorPage<ActivityEntry>(items: []),
          ),
        ],
        child: const MaterialApp(home: AppealHistoryScreen()),
      ),
    );

    await tester.tap(find.text('View account activity'));
    await tester.pumpAndSettle();

    expect(find.text('Reputation activity'), findsOneWidget);
    expect(find.text('Account activity'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';

void main() {
  testWidgets('shows an accessible retry state when activity cannot load', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [jwtProvider.overrideWith((ref) async => null)],
        child: const MaterialApp(home: ReputationLedgerScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Could not load reputation history.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}

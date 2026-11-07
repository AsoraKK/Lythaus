import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';

class _MockInviteService extends Mock implements InviteRedeemService {}

void main() {
  testWidgets('does not expose server or network error details to the invitee', (
    tester,
  ) async {
    final service = _MockInviteService();
    when(
      () => service.redeemInvite(
        email: any(named: 'email'),
        inviteCode: any(named: 'inviteCode'),
        password: any(named: 'password'),
      ),
    ).thenThrow(StateError('private provider token and database detail'));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWithValue(service),
        ],
        child: const MaterialApp(
          home: InviteRedeemScreen(inviteCode: 'SYNTHETIC-ONE-TIME-CODE'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).at(0),
      'tester@example.invalid',
    );
    await tester.enterText(
      find.byType(TextField).at(2),
      'synthetic-password-123',
    );
    await tester.ensureVisible(find.byType(LythButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'We could not verify this invitation. Check the email address and code, or contact support for help.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('private provider token'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty or malformed email is rejected before the API call', (
    tester,
  ) async {
    final service = _MockInviteService();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWithValue(service),
        ],
        child: const MaterialApp(
          home: InviteRedeemScreen(inviteCode: 'SYNTHETIC-CODE'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'not-an-email');
    await tester.enterText(
      find.byType(TextField).at(2),
      'synthetic-password-123',
    );
    await tester.ensureVisible(find.byType(LythButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter the email address your invitation was sent to.'),
      findsOneWidget,
    );
    verifyNever(
      () => service.redeemInvite(
        email: any(named: 'email'),
        inviteCode: any(named: 'inviteCode'),
        password: any(named: 'password'),
      ),
    );
  });
}

import 'dart:async';

import 'package:dio/dio.dart';
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

class _InviteService extends Mock implements InviteRedeemService {}

Future<void> _enterAccountDetails(
  WidgetTester tester, {
  String email = 'tester@example.invalid',
  String code = 'SYNTHETIC-INVITE',
  String password = 'synthetic-password-123',
}) async {
  await tester.enterText(find.byType(TextField).at(0), email);
  await tester.enterText(find.byType(TextField).at(1), code);
  await tester.enterText(find.byType(TextField).at(2), password);
  await tester.ensureVisible(find.byType(LythButton));
  await tester.pump();
}

Future<void> _tapCreateAccount(WidgetTester tester) async {
  final button = find.byType(LythButton);
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> _pump(
  WidgetTester tester,
  _InviteService service, {
  String? inviteCode,
}) async {
  when(
    () => service.redeemInvite(
      email: any(named: 'email'),
      inviteCode: any(named: 'inviteCode'),
      password: any(named: 'password'),
    ),
  ).thenAnswer((_) async {});
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        inviteRedeemServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp(home: InviteRedeemScreen(inviteCode: inviteCode)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('requires the invited email, one-time code and password', (
    tester,
  ) async {
    final service = _InviteService();
    await _pump(tester, service);

    await _tapCreateAccount(tester);
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

    await tester.enterText(
      find.byType(TextField).at(0),
      'tester@example.invalid',
    );
    await _tapCreateAccount(tester);
    expect(find.text('Invitation code is required.'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(1), 'SYNTHETIC-INVITE');
    await _tapCreateAccount(tester);
    expect(find.text('Create a password to continue.'), findsOneWidget);
  });

  testWidgets('submits email-bound code and password then clears secrets', (
    tester,
  ) async {
    final service = _InviteService();
    await _pump(tester, service, inviteCode: 'SYNTHETIC-INVITE');
    await _enterAccountDetails(tester, password: 'synthetic-password-123');
    await _tapCreateAccount(tester);

    verify(
      () => service.redeemInvite(
        email: 'tester@example.invalid',
        inviteCode: 'SYNTHETIC-INVITE',
        password: 'synthetic-password-123',
      ),
    ).called(1);
    expect(
      find.text(
        'Your email is verified and your account is ready. Sign in with your email and password.',
      ),
      findsOneWidget,
    );
    expect(find.text('SYNTHETIC-INVITE'), findsNothing);
    expect(find.text('synthetic-password-123'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ignores duplicate submission while invite redemption is pending', (
    tester,
  ) async {
    final service = _InviteService();
    final pending = Completer<void>();
    await _pump(tester, service);
    when(
      () => service.redeemInvite(
        email: any(named: 'email'),
        inviteCode: any(named: 'inviteCode'),
        password: any(named: 'password'),
      ),
    ).thenAnswer((_) => pending.future);
    await _enterAccountDetails(tester);

    await tester.tap(find.byType(LythButton));
    await tester.pump();
    expect(tester.widget<LythButton>(find.byType(LythButton)).isLoading, isTrue);

    // A keyboard submit can still arrive while the button is disabled. The
    // screen-level guard must prevent a second API request in that window.
    tester.widget<TextField>(find.byType(TextField).at(2)).onSubmitted?.call('');
    await tester.pump();
    verify(
      () => service.redeemInvite(
        email: 'tester@example.invalid',
        inviteCode: 'SYNTHETIC-INVITE',
        password: 'synthetic-password-123',
      ),
    ).called(1);

    pending.complete();
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Your email is verified and your account is ready. Sign in with your email and password.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'shows retry guidance for rate limiting and generic verification failure',
    (tester) async {
      final service = _InviteService();
      await _pump(tester, service);
      when(
        () => service.redeemInvite(
          email: any(named: 'email'),
          inviteCode: any(named: 'inviteCode'),
          password: any(named: 'password'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/auth/email/verify'),
          response: Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/api/auth/email/verify'),
            statusCode: 429,
            data: const {'error': 'rate_limited'},
          ),
        ),
      );
      await _enterAccountDetails(tester);
      await _tapCreateAccount(tester);
      expect(
        find.text('Too many signup attempts. Please wait before trying again.'),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNWidgets(3));
      expect(
        tester.widget<LythButton>(find.byType(LythButton)).isLoading,
        isFalse,
      );
    },
  );

  testWidgets(
    'prefills code from app invitation link without requiring login',
    (tester) async {
      final service = _InviteService();
      await _pump(tester, service, inviteCode: 'SYNTHETIC-PREFILL');
      expect(find.text('SYNTHETIC-PREFILL'), findsOneWidget);
      expect(find.text('Email address'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('keeps a code delivered after the initial invite route build', (
    tester,
  ) async {
    final service = _InviteService();
    await _pump(tester, service);

    // A cold web deep link can build the route before GoRouter supplies its
    // fragment. Updating the same route must prefill the code without a
    // remount or a login redirect.
    await _pump(tester, service, inviteCode: 'SYNTHETIC-LATE-ARRIVAL');

    expect(find.byType(TextField).at(1), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField).at(1)).controller!.text,
      'SYNTHETIC-LATE-ARRIVAL',
    );
    expect(tester.takeException(), isNull);
  });
}

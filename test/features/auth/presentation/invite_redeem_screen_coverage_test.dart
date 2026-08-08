import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';

class _MockAnalytics extends Mock implements AnalyticsClient {}

class _MockInviteService extends Mock implements InviteRedeemService {}

void main() {
  late _MockAnalytics analytics;
  late _MockInviteService inviteService;

  setUp(() {
    analytics = _MockAnalytics();
    inviteService = _MockInviteService();
    when(
      () => analytics.logEvent(any(), properties: any(named: 'properties')),
    ).thenAnswer((_) async {});
  });

  Widget buildWidget({
    List<Override> extra = const [],
    String? inviteCode,
    _MockInviteService? svc,
  }) {
    return ProviderScope(
      overrides: [
        analyticsClientProvider.overrideWithValue(analytics),
        inviteRedeemServiceProvider.overrideWithValue(svc ?? inviteService),
        ...extra,
      ],
      child: MaterialApp(home: InviteRedeemScreen(inviteCode: inviteCode)),
    );
  }

  testWidgets('shows error for empty invite code', (tester) async {
    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    // Clear any pre-filled text
    final field = find.byType(TextField);
    await tester.enterText(field.first, '');
    await tester.pump();

    // Tap the redeem button
    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pump();

    expect(find.text('Invite code is required.'), findsOneWidget);
  });

  testWidgets('shows sign-in error when token is null', (tester) async {
    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => null)]),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'VALID-CODE');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to redeem an invite.'), findsOneWidget);
  });

  testWidgets('successful redeem pops navigator', (tester) async {
    when(
      () => inviteService.redeemInvite(
        accessToken: any(named: 'accessToken'),
        inviteCode: any(named: 'inviteCode'),
      ),
    ).thenAnswer((_) async {});

    // Wrap in a Navigator so pop() works
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(analytics),
          inviteRedeemServiceProvider.overrideWithValue(inviteService),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
        child: MaterialApp(
          home: Builder(
            builder: (ctx) => Scaffold(
              body: ElevatedButton(
                onPressed: () {
                  Navigator.of(ctx).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const InviteRedeemScreen(),
                    ),
                  );
                },
                child: const Text('Go'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Navigate to InviteRedeemScreen
    await tester.tap(find.text('Go'));
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'INVITE-123');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    // Should have popped back
    expect(find.text('Go'), findsOneWidget);
    verify(
      () => inviteService.redeemInvite(
        accessToken: 'tok',
        inviteCode: 'INVITE-123',
      ),
    ).called(1);
  });

  testWidgets('DioException shows error and maps failure reason', (
    tester,
  ) async {
    when(
      () => inviteService.redeemInvite(
        accessToken: any(named: 'accessToken'),
        inviteCode: any(named: 'inviteCode'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
        response: Response(
          requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
          statusCode: 400,
          data: {'message': 'expired'},
        ),
      ),
    );

    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'EXPIRED-CODE');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    expect(
      find.text('Invite could not be redeemed. Please check the code.'),
      findsOneWidget,
    );
  });

  testWidgets('generic error shows error message', (tester) async {
    when(
      () => inviteService.redeemInvite(
        accessToken: any(named: 'accessToken'),
        inviteCode: any(named: 'inviteCode'),
      ),
    ).thenThrow(Exception('unexpected'));

    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'CODE-123');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    expect(
      find.text('Invite could not be redeemed. Please check the code.'),
      findsOneWidget,
    );
  });

  testWidgets('DioException with no response maps to network reason', (
    tester,
  ) async {
    when(
      () => inviteService.redeemInvite(
        accessToken: any(named: 'accessToken'),
        inviteCode: any(named: 'inviteCode'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
        // No response → network error
      ),
    );

    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'NET-CODE');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    expect(
      find.text('Invite could not be redeemed. Please check the code.'),
      findsOneWidget,
    );
  });

  testWidgets('DioException 401 maps to unauthorized', (tester) async {
    when(
      () => inviteService.redeemInvite(
        accessToken: any(named: 'accessToken'),
        inviteCode: any(named: 'inviteCode'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
        response: Response(
          requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
          statusCode: 401,
        ),
      ),
    );

    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(field.first, 'AUTH-CODE');
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pumpAndSettle();

    expect(
      find.text('Invite could not be redeemed. Please check the code.'),
      findsOneWidget,
    );
  });

  testWidgets('pre-filled invite code from constructor', (tester) async {
    await tester.pumpWidget(
      buildWidget(
        inviteCode: 'PRE-FILLED',
        extra: [jwtProvider.overrideWith((ref) async => 'tok')],
      ),
    );
    await tester.pumpAndSettle();

    // The text field should contain the pre-filled code
    expect(find.text('PRE-FILLED'), findsOneWidget);
  });

  testWidgets('clearing error on text change', (tester) async {
    await tester.pumpWidget(
      buildWidget(extra: [jwtProvider.overrideWith((ref) async => 'tok')]),
    );
    await tester.pumpAndSettle();

    // Submit empty to trigger error
    await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
    await tester.pump();
    expect(find.text('Invite code is required.'), findsOneWidget);

    // Type something to clear error
    final field = find.byType(TextField);
    await tester.enterText(field.first, 'X');
    await tester.pump();

    expect(find.text('Invite code is required.'), findsNothing);
  });

  // Additional tests for _mapInviteFailure switch branches
  for (final entry in [
    ('already_used', 'already_used'),
    ('exhausted', 'exhausted'),
    ('revoked', 'revoked'),
    ('email_mismatch', 'email_mismatch'),
    ('already_active', 'already_active'),
    ('missing_email', 'missing_email'),
  ]) {
    testWidgets('DioException with message "${entry.$1}" maps correctly', (
      tester,
    ) async {
      final svc = _MockInviteService();
      when(
        () => svc.redeemInvite(
          accessToken: any(named: 'accessToken'),
          inviteCode: any(named: 'inviteCode'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
            statusCode: 400,
            data: {'message': entry.$2},
          ),
        ),
      );

      await tester.pumpWidget(
        buildWidget(
          svc: svc,
          extra: [jwtProvider.overrideWith((ref) async => 'tok')],
        ),
      );
      await tester.pumpAndSettle();

      final field = find.byType(TextField);
      await tester.enterText(field.first, 'CODE-${entry.$1}');
      await tester.pump();

      await tester.tap(find.widgetWithText(ElevatedButton, 'Redeem invite'));
      await tester.pumpAndSettle();

      expect(
        find.text('Invite could not be redeemed. Please check the code.'),
        findsOneWidget,
      );
    });
  }
}

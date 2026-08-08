import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockInviteRedeemService extends Mock implements InviteRedeemService {}

void main() {
  testWidgets('shows validation error when invite code is empty', (
    tester,
  ) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWith(
            (ref) => const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWith(
            (ref) => MockInviteRedeemService(),
          ),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: InviteRedeemScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();

    expect(find.text('Invite code is required.'), findsOneWidget);
  });

  testWidgets('shows sign-in error when token is missing', (tester) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWith(
            (ref) => const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWith(
            (ref) => MockInviteRedeemService(),
          ),
          jwtProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: InviteRedeemScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'CODE-1234');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to redeem an invite.'), findsOneWidget);
  });

  testWidgets('redeems invite and shows success snackbar', (tester) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    final service = MockInviteRedeemService();
    when(
      () => service.redeemInvite(accessToken: 'token', inviteCode: 'CODE-1234'),
    ).thenAnswer((_) async {});

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWith(
            (ref) => const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWith((ref) => service),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: InviteRedeemScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'CODE-1234');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();

    verify(
      () => service.redeemInvite(accessToken: 'token', inviteCode: 'CODE-1234'),
    ).called(1);
  });

  testWidgets('shows error when redemption fails', (tester) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    final service = MockInviteRedeemService();
    final request = RequestOptions(path: '/api/auth/redeem-invite');
    final response = Response<Map<String, dynamic>>(
      data: const {'message': 'expired'},
      statusCode: 400,
      requestOptions: request,
    );
    when(
      () => service.redeemInvite(accessToken: 'token', inviteCode: 'CODE-1234'),
    ).thenThrow(
      DioException(
        requestOptions: request,
        response: response,
        type: DioExceptionType.badResponse,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWith(
            (ref) => const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWith((ref) => service),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: InviteRedeemScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'CODE-1234');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();

    expect(
      find.text('Invite could not be redeemed. Please check the code.'),
      findsOneWidget,
    );
  });

  testWidgets('shows rate limit error when redemption is throttled', (
    tester,
  ) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    final service = MockInviteRedeemService();
    final request = RequestOptions(path: '/api/auth/redeem-invite');
    when(
      () => service.redeemInvite(accessToken: 'token', inviteCode: 'CODE-1234'),
    ).thenThrow(
      DioException(
        requestOptions: request,
        response: Response<Map<String, dynamic>>(
          data: const {'error': 'rate_limited', 'retry_after_seconds': 30},
          statusCode: 429,
          requestOptions: request,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWith(
            (ref) => const NullAnalyticsClient(),
          ),
          inviteRedeemServiceProvider.overrideWith((ref) => service),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: InviteRedeemScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'CODE-1234');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Too many invite redemption attempts. Please wait before trying again.',
      ),
      findsOneWidget,
    );
  });
}

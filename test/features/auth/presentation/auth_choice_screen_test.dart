import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class _MockAuthService extends Mock implements AuthService {}

class _MockIntegrityGuard extends Mock implements DeviceIntegrityGuard {}

void main() {
  for (final outcome in ['timeout', 'error', 'disposed', 'blocked']) {
    testWidgets(
      'sign-in security preflight handles $outcome without a late login',
      (tester) async {
        final auth = _MockAuthService();
        final guard = _MockIntegrityGuard();
        final evaluation = Completer<DeviceIntegrityDecision>();
        when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
        when(
          () => guard.evaluate(IntegrityUseCase.signIn),
        ).thenAnswer((_) => evaluation.future);
        await tester.binding.setSurfaceSize(const Size(430, 950));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              analyticsClientProvider.overrideWithValue(
                const NullAnalyticsClient(),
              ),
              enhancedAuthServiceProvider.overrideWithValue(auth),
              deviceIntegrityGuardProvider.overrideWithValue(guard),
            ],
            child: const MaterialApp(home: AuthChoiceScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextField, 'Email'),
          'synthetic@example.invalid',
        );
        await tester.enterText(
          find.widgetWithText(TextField, 'Password'),
          'historical12',
        );
        await tester.tap(find.text('Sign in with email'));
        await tester.pump();
        expect(find.text('Signing in…'), findsOneWidget);
        await tester.tap(find.text('Signing in…'));
        verify(() => guard.evaluate(IntegrityUseCase.signIn)).called(1);
        if (outcome == 'disposed') {
          await tester.pumpWidget(const SizedBox.shrink());
          evaluation.complete(DeviceIntegrityDecision.allow());
        } else if (outcome == 'error') {
          evaluation.completeError(StateError('Synthetic device failure'));
        } else if (outcome == 'blocked') {
          evaluation.complete(
            DeviceIntegrityDecision.block('security.device_integrity_blocked'),
          );
        } else {
          await tester.pump(const Duration(seconds: 9));
          evaluation.complete(DeviceIntegrityDecision.allow());
        }
        await tester.pumpAndSettle();
        if (outcome == 'timeout' || outcome == 'error') {
          expect(
            find.text('The security check could not finish. Please try again.'),
            findsOneWidget,
          );
          expect(find.text('Sign in with email'), findsOneWidget);
        }
        if (outcome == 'blocked') {
          expect(find.text('Security Notice'), findsOneWidget);
          await tester.tap(find.text('OK'));
          await tester.pumpAndSettle();
        }
        verifyNever(() => auth.loginWithEmail(any(), any()));
        expect(tester.takeException(), isNull);
      },
    );
  }
  for (final action in [
    'Forgot password?',
    'Resend verification email',
    'Create account',
  ]) {
    for (final outcome in ['opened', 'unavailable', 'error']) {
      testWidgets(
        '$action reports $outcome without claiming an email was sent',
        (tester) async {
          final auth = _MockAuthService();
          when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
          final launches = <Uri>[];
          await tester.binding.setSurfaceSize(const Size(430, 950));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                analyticsClientProvider.overrideWithValue(
                  const NullAnalyticsClient(),
                ),
                enhancedAuthServiceProvider.overrideWithValue(auth),
              ],
              child: MaterialApp(
                home: AuthChoiceScreen(
                  launchAuthPage: (uri) async {
                    launches.add(uri);
                    if (outcome == 'error') throw StateError('Launch failed');
                    return outcome == 'opened';
                  },
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text(action));
          await tester.pumpAndSettle();
          expect(launches.single.scheme, 'https');
          expect(launches.single.host, 'lythaus.co');
          expect(
            launches.single.path,
            {
              'Forgot password?': '/forgot-password',
              'Resend verification email': '/resend-verification',
              'Create account': '/signup',
            }[action],
          );
          expect(
            find.byType(SnackBar),
            outcome == 'opened' ? findsNothing : findsOneWidget,
          );
          expect(find.text('Opening verification…'), findsNothing);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('invalid login is actionable and guest remains read-only', (
    tester,
  ) async {
    final auth = _MockAuthService();
    when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
    when(() => auth.logout()).thenAnswer((_) async {});
    await tester.binding.setSurfaceSize(const Size(430, 950));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in with email'));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter a valid email and your existing password.'),
      findsOneWidget,
    );
    verifyNever(() => auth.loginWithEmail(any(), any()));
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(find.byTooltip('Hide password'), findsOneWidget);
    await tester.tap(find.text('Continue as guest'));
    await tester.pumpAndSettle();
    verify(() => auth.logout()).called(1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders email and guest launch options', (tester) async {
    final authService = _MockAuthService();
    when(() => authService.getCurrentUser()).thenAnswer((_) async => null);
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(authService),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome to Lythaus'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in with email'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
    expect(find.text('Resend verification email'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
    expect(find.text('Continue as guest'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/features/auth/domain/user.dart';

User _user() => User(
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'person@example.com',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026, 8, 6),
  lastLoginAt: DateTime.utc(2026, 8, 6),
);

class _MockAuthService extends Mock implements AuthService {}

class _MockIntegrityGuard extends Mock implements DeviceIntegrityGuard {}

void main() {
  test(
    'profile setup is offered after interactive login and stays optional',
    () {
      expect(
        resolveAppRedirect(
          matchedLocation: '/login',
          user: _user(),
          isGuest: false,
          profileSetupRequested: true,
        ),
        '/profile/setup',
      );
      expect(
        resolveAppRedirect(
          matchedLocation: '/profile/setup',
          user: _user(),
          isGuest: false,
          profileSetupRequested: true,
        ),
        isNull,
      );
      expect(
        resolveAppRedirect(matchedLocation: '/', user: _user(), isGuest: false),
        isNull,
      );
      expect(
        resolveAppRedirect(
          matchedLocation: '/profile/setup',
          user: null,
          isGuest: true,
        ),
        '/',
      );
      expect(
        resolveAppRedirect(
          matchedLocation: '/profile/setup',
          user: null,
          isGuest: false,
        ),
        '/login',
      );
      expect(
        resolveAppRedirect(
          matchedLocation: '/invite/code',
          user: _user(),
          isGuest: false,
          profileSetupRequested: true,
        ),
        isNull,
      );
    },
  );
  testWidgets('auth loading/errors retain router and entered email', (
    tester,
  ) async {
    final service = _MockAuthService();
    final guard = _MockIntegrityGuard();
    when(
      () => guard.evaluate(IntegrityUseCase.signIn),
    ).thenAnswer((_) async => DeviceIntegrityDecision.allow());
    when(() => service.getCurrentUser()).thenAnswer((_) async => null);
    when(
      () => service.loginWithEmail(any(), any()),
    ).thenThrow(AuthFailure.invalidCredentials());
    final container = ProviderContainer(
      overrides: [
        enhancedAuthServiceProvider.overrideWithValue(service),
        deviceIntegrityGuardProvider.overrideWithValue(guard),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      ],
    );
    addTearDown(container.dispose);
    await tester.binding.setSurfaceSize(const Size(430, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: Consumer(
          builder: (context, ref, _) =>
              MaterialApp.router(routerConfig: ref.watch(appRouterProvider)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final router = container.read(appRouterProvider);
    await tester.enterText(
      find.byType(TextField).at(0),
      'synthetic@example.invalid',
    );
    await tester.enterText(find.byType(TextField).at(1), 'historical12');
    await tester.tap(find.text('Sign in with email'));
    await tester.pumpAndSettle();
    expect(container.read(appRouterProvider), same(router));
    expect(
      tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text,
      'synthetic@example.invalid',
    );
    expect(find.text('Invalid credentials'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('anonymous users are sent to email or guest entry', () {
    expect(
      resolveAppRedirect(matchedLocation: '/', user: null, isGuest: false),
      '/login',
    );
  });

  test('guest users can enter the app shell', () {
    expect(
      resolveAppRedirect(matchedLocation: '/', user: null, isGuest: true),
      isNull,
    );
  });

  test('email-authenticated users leave the login route', () {
    expect(
      resolveAppRedirect(
        matchedLocation: '/login',
        user: _user(),
        isGuest: false,
      ),
      '/',
    );
  });
}

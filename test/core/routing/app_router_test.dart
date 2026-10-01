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
import 'package:dio/dio.dart';
import 'package:lythaus/features/authenticity/alpha_api.dart';

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

class _AlphaApi extends PrivateAlphaApi {
  _AlphaApi() : super(Dio(), () async => 'route-fixture');
  @override
  Future<Map<String, dynamic>> request(
    String suffix, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async => {'items': <Map<String, dynamic>>[]};
}

void main() {
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

  test('guest users cannot enter the private alpha', () {
    expect(
      resolveAppRedirect(
        matchedLocation: '/authenticity',
        user: null,
        isGuest: true,
      ),
      '/',
    );
  });

  testWidgets(
    'private alpha destination survives authenticated session restoration',
    (tester) async {
      final service = _MockAuthService();
      when(() => service.getCurrentUser()).thenAnswer((_) async => null);
      final container = ProviderContainer(
        overrides: [
          enhancedAuthServiceProvider.overrideWithValue(service),
          privateAlphaApiProvider.overrideWithValue(_AlphaApi()),
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: Consumer(
            builder: (_, ref, _) =>
                MaterialApp.router(routerConfig: ref.watch(appRouterProvider)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final router = container.read(appRouterProvider);
      router.go('/authenticity');
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/login');
      container.read(authStateProvider.notifier).setUser(_user());
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/authenticity');
      expect(find.text('Private authenticity alpha'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

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

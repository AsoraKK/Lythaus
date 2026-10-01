import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/user.dart';

class _MockAuthService extends Mock implements AuthService {}

void main() {
  late _MockAuthService authService;
  late ProviderContainer container;
  final user = User(
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'person@example.com',
    role: UserRole.user,
    tier: UserTier.bronze,
    reputationScore: 0,
    createdAt: DateTime.utc(2026, 8, 6),
    lastLoginAt: DateTime.utc(2026, 8, 6),
  );

  setUp(() {
    authService = _MockAuthService();
    when(() => authService.getCurrentUser()).thenAnswer((_) async => null);
    when(() => authService.getJwtToken()).thenAnswer((_) async => null);
    when(() => authService.remoteLogoutConfirmed).thenReturn(true);
    when(() => authService.logout()).thenAnswer((_) async {});
    container = ProviderContainer(
      overrides: [enhancedAuthServiceProvider.overrideWithValue(authService)],
    );
  });

  tearDown(() => container.dispose());

  test('derived state and explicit user updates remain consistent', () async {
    final notifier = container.read(authStateProvider.notifier);
    expect(container.read(isAuthLoadingProvider), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(isAuthenticatedProvider), isFalse);
    notifier.setUser(user);
    expect(container.read(currentUserProvider), user);
    expect(container.read(isAuthenticatedProvider), isTrue);
    expect(container.read(authErrorProvider), isNull);
    expect(container.read(inviteRedeemServiceProvider), isNotNull);
  });

  test('restoration failure has an explicit error state', () async {
    when(
      () => authService.getCurrentUser(),
    ).thenThrow(AuthFailure.networkError('Offline'));
    container.read(authStateProvider);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(authErrorProvider)?.message, 'Offline');
    expect(container.read(isAuthenticatedProvider), isFalse);
  });

  for (final failure in [
    AuthFailure.invalidCredentials('Invalid email or password'),
    StateError('private detail'),
  ]) {
    test(
      'login failure is typed and never exposes internal detail: ${failure.runtimeType}',
      () async {
        when(() => authService.loginWithEmail(any(), any())).thenThrow(failure);
        await container
            .read(authStateProvider.notifier)
            .signInWithEmail('synthetic@example.invalid', 'historical12');
        expect(container.read(authErrorProvider), isA<AuthFailure>());
        expect(
          container.read(authErrorProvider)!.message,
          isNot(contains('private detail')),
        );
      },
    );
  }

  for (final valid in [true, false]) {
    test('refresh and validation expose the $valid session result', () async {
      when(() => authService.refreshSession()).thenAnswer((_) async => valid);
      when(
        () => authService.validateAndRefreshToken(),
      ).thenAnswer((_) async => valid);
      final notifier = container.read(authStateProvider.notifier);
      await Future<void>.delayed(Duration.zero);
      notifier.setUser(user);
      final before = container.read(tokenVersionProvider);
      await notifier.refreshToken();
      expect(container.read(authStateProvider).hasError, !valid);
      if (valid) {
        expect(container.read(tokenVersionProvider), greaterThan(before));
      }
      when(() => authService.getCurrentUser()).thenAnswer((_) async => user);
      await notifier.validateToken();
      expect(container.read(currentUserProvider), valid ? user : null);
    });
  }

  for (final failure in [
    AuthFailure.networkError('Offline'),
    StateError('private detail'),
  ]) {
    test(
      'refresh errors clear usable auth state: ${failure.runtimeType}',
      () async {
        when(() => authService.refreshSession()).thenThrow(failure);
        final notifier = container.read(authStateProvider.notifier);
        await notifier.refreshToken();
        expect(container.read(authErrorProvider), isA<AuthFailure>());
        expect(
          container.read(authErrorProvider)!.message,
          isNot(contains('private detail')),
        );
        when(
          () => authService.validateAndRefreshToken(),
        ).thenThrow(AuthFailure.networkError('Offline'));
        await notifier.validateToken();
        expect(container.read(authErrorProvider)?.message, 'Offline');
      },
    );
  }

  test('unconfirmed remote logout is not described as revoked', () async {
    when(() => authService.remoteLogoutConfirmed).thenReturn(false);
    await container.read(authStateProvider.notifier).signOut();
    expect(
      container.read(authErrorProvider)?.message,
      contains('could not be revoked'),
    );
    expect(container.read(currentUserProvider), isNull);
  });

  test('offline logout still permits public guest browsing', () async {
    when(() => authService.logout()).thenThrow(StateError('Offline'));
    await container.read(authStateProvider.notifier).continueAsGuest();
    expect(container.read(guestModeProvider), isTrue);
    expect(container.read(currentUserProvider), isNull);
  });

  test('email sign-in updates authenticated state', () async {
    when(
      () => authService.loginWithEmail(any(), any()),
    ).thenAnswer((_) async => user);
    await container
        .read(authStateProvider.notifier)
        .signInWithEmail('person@example.com', 'correct-horse-battery-staple');
    expect(container.read(authStateProvider).valueOrNull, user);
    expect(container.read(guestModeProvider), isFalse);
  });

  test('guest access clears the authenticated session', () async {
    when(() => authService.logout()).thenAnswer((_) async {});
    await container.read(authStateProvider.notifier).continueAsGuest();
    expect(container.read(guestModeProvider), isTrue);
    expect(container.read(authStateProvider).valueOrNull, isNull);
  });

  test('jwt provider reads the email session token', () async {
    when(() => authService.getJwtToken()).thenAnswer((_) async => 'token');
    expect(await container.read(jwtProvider.future), 'token');
  });

  test(
    'late initial restoration cannot overwrite a completed sign-in',
    () async {
      final restoration = Completer<User?>();
      when(
        () => authService.getCurrentUser(),
      ).thenAnswer((_) => restoration.future);
      when(
        () => authService.loginWithEmail(any(), any()),
      ).thenAnswer((_) async => user);
      final notifier = container.read(authStateProvider.notifier);
      await notifier.signInWithEmail(
        'synthetic@example.invalid',
        'historical12',
      );
      restoration.complete(null);
      await Future<void>.delayed(Duration.zero);
      expect(container.read(authStateProvider).valueOrNull, user);
    },
  );

  test(
    'sign-out fences a late successful sign-in and clears user state immediately',
    () async {
      final login = Completer<User>();
      when(
        () => authService.loginWithEmail(any(), any()),
      ).thenAnswer((_) => login.future);
      final notifier = container.read(authStateProvider.notifier);
      final pending = notifier.signInWithEmail(
        'synthetic@example.invalid',
        'historical12',
      );
      await notifier.signOut();
      login.complete(user);
      await pending;
      expect(container.read(authStateProvider).valueOrNull, isNull);
    },
  );

  test('disposed notifier ignores an interrupted request result', () async {
    final login = Completer<User>();
    when(
      () => authService.loginWithEmail(any(), any()),
    ).thenAnswer((_) => login.future);
    final notifier = container.read(authStateProvider.notifier);
    final pending = notifier.signInWithEmail(
      'synthetic@example.invalid',
      'historical12',
    );
    container.invalidate(authStateProvider);
    login.complete(user);
    await expectLater(pending, completes);
  });
}

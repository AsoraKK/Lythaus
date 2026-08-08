import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
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
    container = ProviderContainer(
      overrides: [enhancedAuthServiceProvider.overrideWithValue(authService)],
    );
  });

  tearDown(() => container.dispose());

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
}

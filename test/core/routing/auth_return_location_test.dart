import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/core/routing/auth_return_location.dart';
import 'package:lythaus/features/auth/domain/user.dart';

void main() {
  test(
    'return targets preserve internal query and reject external/loop targets',
    () {
      for (final target in [
        '/search?q=water%20quality',
        '/?tab=rewards',
        '/invite/code',
        '/settings/security',
      ]) {
        expect(safeAuthReturn(target), target);
        expect(
          Uri.parse(signInLocation(target)).queryParameters['returnTo'],
          target,
        );
      }
      for (final target in <String?>[
        null,
        'https://example.invalid',
        '//example.invalid',
        '/%2Fexample.invalid',
        '/\\example.invalid',
        'search',
        '/login',
        '/profile/setup',
        '/search#external',
        '/search\n',
      ]) {
        expect(safeAuthReturn(target), '/');
      }
    },
  );

  test('guest can reopen login, even with a pending invite', () {
    expect(
      resolveAppRedirect(
        matchedLocation: '/login',
        user: null,
        isGuest: true,
        pendingCode: 'kept-code',
        requestedUri: Uri.parse(signInLocation('/search?q=water')),
      ),
      isNull,
    );
    expect(
      resolveAppRedirect(matchedLocation: '/login', user: null, isGuest: true),
      '/',
    );
  });

  test('anonymous deep link and profile setup preserve the same query', () {
    const target = '/search?q=water';
    expect(
      resolveAppRedirect(
        matchedLocation: '/search',
        user: null,
        isGuest: false,
        requestedUri: Uri.parse(target),
      ),
      signInLocation(target),
    );
    final user = User(
      id: 'u1',
      email: 'synthetic@example.invalid',
      role: UserRole.user,
      tier: UserTier.bronze,
      reputationScore: 0,
      createdAt: DateTime(2026),
      lastLoginAt: DateTime(2026),
    );
    final setup = resolveAppRedirect(
      matchedLocation: '/login',
      user: user,
      isGuest: false,
      profileSetupRequested: true,
      requestedUri: Uri.parse(signInLocation(target)),
    );
    expect(Uri.parse(setup!).path, '/profile/setup');
    expect(Uri.parse(setup).queryParameters['returnTo'], target);
    expect(
      resolveAppRedirect(
        matchedLocation: '/login',
        user: user,
        isGuest: false,
        requestedUri: Uri.parse(signInLocation(target)),
      ),
      target,
    );
    expect(
      resolveAppRedirect(
        matchedLocation: '/login',
        user: user,
        isGuest: false,
        requestedUri: Uri.parse(signInLocation(target, accountEntry: true)),
      ),
      isNull,
    );
    expect(
      resolveAppRedirect(
        matchedLocation: '/login',
        user: user,
        isGuest: false,
        pendingCode: 'kept-code',
        profileSetupRequested: true,
        requestedUri: Uri.parse(signInLocation(target)),
      ),
      '/invite/kept-code',
    );
  });
}

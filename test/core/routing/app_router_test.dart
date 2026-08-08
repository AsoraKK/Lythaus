import 'package:flutter_test/flutter_test.dart';

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

void main() {
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

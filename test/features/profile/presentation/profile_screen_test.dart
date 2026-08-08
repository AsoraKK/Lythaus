/// Widget tests for ProfileScreen.
///
/// Covers: loading state, error state, successful render, unauthenticated state.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

PublicUser _fakeUser({
  String id = 'user-1',
  String displayName = 'Test User',
  String tier = 'free',
}) {
  return PublicUser(
    id: id,
    displayName: displayName,
    handle: '@testuser',
    tier: tier,
    reputationScore: 100,
    journalistVerified: false,
    badges: const [],
  );
}

List<Override> _commonOverrides(String userId) => [
  jwtProvider.overrideWith((ref) async => null),
  currentUserProvider.overrideWith((ref) => null),
  followStatusProvider(userId).overrideWith(
    (_) => Future.value(const FollowStatus(following: false, followerCount: 0)),
  ),
];

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('shows loading spinner while fetching profile', (tester) async {
    final completer = Completer<PublicUser>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ..._commonOverrides('user-1'),
          publicUserProvider('user-1').overrideWith((_) => completer.future),
        ],
        child: const MaterialApp(home: ProfileScreen(userId: 'user-1')),
      ),
    );
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error message when profile fetch fails', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ..._commonOverrides('user-1'),
          publicUserProvider(
            'user-1',
          ).overrideWith((_) => Future.error(Exception('Network error'))),
        ],
        child: const MaterialApp(home: ProfileScreen(userId: 'user-1')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Unable to load profile'), findsOneWidget);
  });

  testWidgets('shows sign-in prompt when userId is null and no current user', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => null),
          jwtProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );
    await tester.pump();
    expect(find.textContaining('Sign in'), findsOneWidget);
  });

  testWidgets('renders display name when profile loads successfully', (
    tester,
  ) async {
    final user = _fakeUser();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ..._commonOverrides('user-1'),
          publicUserProvider('user-1').overrideWith((_) => Future.value(user)),
        ],
        child: const MaterialApp(home: ProfileScreen(userId: 'user-1')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Test User'), findsWidgets);
  });
}

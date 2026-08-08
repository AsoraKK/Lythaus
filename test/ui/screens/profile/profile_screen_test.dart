/// Widget tests for ProfileScreen.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

const _fakeUser = PublicUser(
  id: 'user-1',
  displayName: 'Jane Doe',
  handle: '@janedoe',
  tier: 'silver',
);

const _ownerVisibleUser = PublicUser(
  id: 'user-1',
  displayName: 'Jane Doe',
  handle: '@janedoe',
  tier: 'gold',
  journalistVerified: true,
  badges: ['Trusted', 'Editor'],
  trustPassportVisibility: 'public_expanded',
  reputationScore: 321,
);

const _otherUser = PublicUser(
  id: 'user-2',
  displayName: 'Private Person',
  handle: '@private',
  tier: 'bronze',
  reputationScore: 12,
);

final _fakeAuthUser = User(
  id: 'user-1',
  email: 'jane@example.com',
  role: UserRole.user,
  tier: UserTier.silver,
  reputationScore: 100,
  createdAt: DateTime.utc(2024),
  lastLoginAt: DateTime.utc(2024),
);

final _fakeAdminUser = _fakeAuthUser.copyWith(role: UserRole.admin);

Widget _buildApp({List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: ProfileScreen()),
  );
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  // ── No user signed in ──────────────────────────────────────────────────────
  group('No signed-in user', () {
    testWidgets('shows sign-in prompt when no userId and no current user', (
      tester,
    ) async {
      await tester.pumpWidget(
        _buildApp(overrides: [currentUserProvider.overrideWithValue(null)]),
      );
      await tester.pump();

      expect(
        find.text('Sign in to view your profile details.'),
        findsOneWidget,
      );
    });

    testWidgets('shows Profile AppBar when no user', (tester) async {
      await tester.pumpWidget(
        _buildApp(overrides: [currentUserProvider.overrideWithValue(null)]),
      );
      await tester.pump();

      expect(find.text('Profile'), findsOneWidget);
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  group('Loading state', () {
    testWidgets('shows CircularProgressIndicator while profile loads', (
      tester,
    ) async {
      final completer = Completer<PublicUser>();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) => completer.future),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      completer.complete(_fakeUser);
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────
  group('Error state', () {
    testWidgets('shows error message when profile load fails', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) async => throw Exception('Network failure')),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Unable to load profile'), findsOneWidget);
    });
  });

  // ── Success state ──────────────────────────────────────────────────────────
  group('Success state', () {
    testWidgets('shows displayName in AppBar', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider('user-1').overrideWith((ref) async => _fakeUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Jane Doe'), findsAtLeastNWidgets(1));
    });

    testWidgets('shows handle label', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider('user-1').overrideWith((ref) async => _fakeUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('@janedoe'), findsOneWidget);
    });

    testWidgets('owner sees profile actions but not staff tools by default', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) async => _ownerVisibleUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('gold'), findsOneWidget);
      expect(find.text('Editorial Contributor'), findsNothing);
      expect(find.text('Trusted'), findsNothing);
      expect(find.text('Editor'), findsNothing);
      expect(find.text('Moderation hub'), findsNothing);
      expect(find.text('Control Panel'), findsNothing);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Reputation'), findsNothing);
    });

    testWidgets('admin owner sees staff tools', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAdminUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) async => _ownerVisibleUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Moderation hub'), findsOneWidget);
      expect(find.text('Control Panel'), findsNothing);
      expect(find.text('Reputation'), findsNothing);
    });

    testWidgets('deferred Trust Passport surface is not rendered', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) async => _ownerVisibleUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Trust Passport'), findsNothing);
      expect(find.text('Appeals outcomes'), findsNothing);
      expect(find.textContaining('Juror'), findsNothing);
    });

    testWidgets('owner profile actions open their destination routes', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-1',
            ).overrideWith((ref) async => _ownerVisibleUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Edit profile'));
      await tester.tap(find.text('Edit profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Edit profile'), findsAtLeastNWidgets(1));
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Settings'));
      await tester.tap(find.text('Settings'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Settings'), findsWidgets);
    });

    testWidgets('non-owner does not receive deferred trust surfaces', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-2',
            ).overrideWith((ref) async => _otherUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen(userId: 'user-2')),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Private Person'), findsWidgets);
      expect(find.textContaining('Trust Passport'), findsNothing);
      expect(find.text('Reputation'), findsNothing);
    });
  });
}

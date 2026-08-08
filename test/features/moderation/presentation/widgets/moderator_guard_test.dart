/// Widget tests for ModeratorGuard — shows child for moderators/admins,
/// shows unauthorized screen otherwise.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/moderation/presentation/widgets/moderator_guard.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';

class _MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _MockAuthStateNotifier(super.state);
  @override
  Future<void> refreshToken() async {}
  @override
  Future<void> signInWithEmail(String email, String password) async {}
  @override
  Future<void> signOut() async => state = const AsyncValue.data(null);
  @override
  Future<void> validateToken() async {}
  @override
  Future<void> continueAsGuest() async {}
  @override
  void setUser(User user) {
    state = AsyncValue.data(user);
  }
}

User _makeUser(UserRole role) => User(
  id: 'u1',
  email: 'test@test.com',
  role: role,
  tier: UserTier.bronze,
  reputationScore: 50,
  createdAt: DateTime(2024),
  lastLoginAt: DateTime(2024),
);

void main() {
  Widget buildWithAuth(AsyncValue<User?> authState) {
    return ProviderScope(
      overrides: [
        authStateProvider.overrideWith(
          (ref) => _MockAuthStateNotifier(authState),
        ),
      ],
      child: const MaterialApp(
        home: ModeratorGuard(
          title: 'Test Guard',
          child: Scaffold(body: Text('Protected Content')),
        ),
      ),
    );
  }

  group('ModeratorGuard', () {
    testWidgets('shows loading indicator while auth is loading', (
      tester,
    ) async {
      await tester.pumpWidget(buildWithAuth(const AsyncValue.loading()));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Test Guard'), findsOneWidget);
    });

    testWidgets('shows unauthorized for error state', (tester) async {
      await tester.pumpWidget(
        buildWithAuth(AsyncValue.error('auth error', StackTrace.current)),
      );
      await tester.pump();

      expect(find.text('Moderator access required'), findsOneWidget);
      expect(find.byIcon(Icons.block_outlined), findsOneWidget);
    });

    testWidgets('shows unauthorized for regular user', (tester) async {
      await tester.pumpWidget(
        buildWithAuth(AsyncValue.data(_makeUser(UserRole.user))),
      );
      await tester.pump();

      expect(find.text('Moderator access required'), findsOneWidget);
      expect(
        find.text(
          'You need elevated permissions to access these internal tools.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('shows child content for moderator', (tester) async {
      await tester.pumpWidget(
        buildWithAuth(AsyncValue.data(_makeUser(UserRole.moderator))),
      );
      await tester.pump();

      expect(find.text('Protected Content'), findsOneWidget);
    });

    testWidgets('shows child content for admin', (tester) async {
      await tester.pumpWidget(
        buildWithAuth(AsyncValue.data(_makeUser(UserRole.admin))),
      );
      await tester.pump();

      expect(find.text('Protected Content'), findsOneWidget);
    });

    testWidgets('shows unauthorized for null user', (tester) async {
      await tester.pumpWidget(buildWithAuth(const AsyncValue.data(null)));
      await tester.pump();

      expect(find.text('Moderator access required'), findsOneWidget);
    });
  });
}

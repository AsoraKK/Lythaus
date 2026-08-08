import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

class _MockFollowService extends Mock implements FollowService {}

class _FakeAnalyticsEventTracker implements AnalyticsEventTracker {
  final List<String> loggedOnce = [];

  @override
  Future<bool> logEventOnce(
    AnalyticsClient client,
    String eventName, {
    String? userId,
    Map<String, Object?>? properties,
  }) async {
    loggedOnce.add(eventName);
    return true;
  }

  @override
  Future<bool> wasLogged(String eventName, {String? userId}) async {
    return loggedOnce.contains(eventName);
  }
}

void main() {
  testWidgets('profile screen prompts sign in when unauthenticated', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [currentUserProvider.overrideWith((ref) => null)],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Sign in to view your profile details.'), findsOneWidget);
  });

  testWidgets('profile screen renders user details and stats', (tester) async {
    final user = User(
      id: 'user-1',
      email: 'ada@example.com',
      role: UserRole.user,
      tier: UserTier.gold,
      reputationScore: 120,
      createdAt: DateTime(2024, 1, 1),
      lastLoginAt: DateTime(2024, 1, 2),
    );
    const profile = PublicUser(
      id: 'user-1',
      displayName: 'Ada Lovelace',
      handle: '@ada',
      tier: 'gold',
      reputationScore: 120,
      journalistVerified: true,
      badges: ['Founding member'],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => user),
          publicUserProvider(
            user.id,
          ).overrideWith((ref) => Future.value(profile)),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Ada Lovelace'), findsWidgets);
    expect(find.text('@ada'), findsOneWidget);
    expect(find.text('gold'), findsOneWidget);
    expect(find.text('120 points'), findsNothing);
    expect(find.text('Founding member'), findsNothing);
    expect(find.text('Reputation'), findsNothing);
    expect(find.text('Moderation hub'), findsNothing);
    expect(find.text('Settings'), findsOneWidget);
  });

  testWidgets('profile screen shows error state on load failure', (
    tester,
  ) async {
    final user = User(
      id: 'user-2',
      email: 'error@example.com',
      role: UserRole.user,
      tier: UserTier.bronze,
      reputationScore: 0,
      createdAt: DateTime(2024, 1, 1),
      lastLoginAt: DateTime(2024, 1, 2),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => user),
          publicUserProvider(
            user.id,
          ).overrideWith((ref) => Future.error(Exception('no profile'))),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.textContaining('Unable to load profile'), findsOneWidget);
  });

  testWidgets('profile screen follows another user', (tester) async {
    final currentUser = User(
      id: 'user-1',
      email: 'ada@example.com',
      role: UserRole.user,
      tier: UserTier.gold,
      reputationScore: 120,
      createdAt: DateTime(2024, 1, 1),
      lastLoginAt: DateTime(2024, 1, 2),
    );
    const profile = PublicUser(
      id: 'user-2',
      displayName: 'Grace Hopper',
      handle: '@grace',
      tier: 'gold',
      reputationScore: 80,
    );
    final followService = _MockFollowService();
    final tracker = _FakeAnalyticsEventTracker();

    when(
      () => followService.follow(targetUserId: 'user-2', accessToken: 'token'),
    ).thenAnswer(
      (_) async => const FollowStatus(following: true, followerCount: 6),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => currentUser),
          publicUserProvider(
            currentUser.id,
          ).overrideWith((ref) => Future.value(profile)),
          followServiceProvider.overrideWith((ref) => followService),
          followStatusProvider(profile.id).overrideWith(
            (ref) => Future.value(
              const FollowStatus(following: false, followerCount: 5),
            ),
          ),
          jwtProvider.overrideWith((ref) async => 'token'),
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          analyticsEventTrackerProvider.overrideWithValue(tracker),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('5 followers'), findsOneWidget);
    await tester.tap(find.text('Follow'));
    await tester.pump(const Duration(milliseconds: 50));

    verify(
      () => followService.follow(targetUserId: 'user-2', accessToken: 'token'),
    ).called(1);
    expect(tracker.loggedOnce, contains(AnalyticsEvents.firstFollow));
  });

  testWidgets('profile screen shows auth error when token missing', (
    tester,
  ) async {
    final currentUser = User(
      id: 'user-1',
      email: 'ada@example.com',
      role: UserRole.user,
      tier: UserTier.gold,
      reputationScore: 120,
      createdAt: DateTime(2024, 1, 1),
      lastLoginAt: DateTime(2024, 1, 2),
    );
    const profile = PublicUser(
      id: 'user-2',
      displayName: 'Grace Hopper',
      handle: '@grace',
      tier: 'gold',
      reputationScore: 80,
    );
    final followService = _MockFollowService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => currentUser),
          publicUserProvider(
            currentUser.id,
          ).overrideWith((ref) => Future.value(profile)),
          followServiceProvider.overrideWith((ref) => followService),
          followStatusProvider(profile.id).overrideWith(
            (ref) => Future.value(
              const FollowStatus(following: false, followerCount: 5),
            ),
          ),
          jwtProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Follow'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Sign in to follow accounts.'), findsOneWidget);
  });
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as feed;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import '../helpers/content_recovery.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

class _MockFollowService extends Mock implements FollowService {}

class _FakeOwnerPostsService extends OwnerPostsService {
  _FakeOwnerPostsService([this.items = const []]) : super(Dio());

  final List<OwnerPost> items;

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => OwnerPostsPage(items: items, nextCursor: null);
}

class _MockPostRepository extends Mock implements PostRepository {}

const _reputationSnapshot = ReputationState(
  userId: 'user-1',
  level: 2,
  levelName: 'Trusted contributor',
  reputationStatus: 'active',
  reputationBand: 'Constructive participation',
  policyVersion: 'reputation-policy-v1',
  pillars: <String, String>{
    'constructiveParticipation': 'strong',
    'accountability': 'strong',
    'governance': 'developing',
  },
  promotionBlockers: <String>[],
);

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

OwnerProfile _ownerProfile(PublicUser user) => OwnerProfile(
  user: user,
  moderationState: 'allowed',
  publicVisibility: true,
);

void main() {
  setUpAll(() => registerFallbackValue(CancelToken()));

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
          ownerPostsServiceProvider.overrideWithValue(_FakeOwnerPostsService()),
          ownerProfileProvider.overrideWith(
            (ref) => Future.value(_ownerProfile(profile)),
          ),
          jwtProvider.overrideWith((ref) async => 'synthetic-token'),
          reputationProvider.overrideWith((ref) async => _reputationSnapshot),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Ada Lovelace'), findsWidgets);
    expect(find.text('@ada'), findsOneWidget);
    expect(find.text('Subscription: gold'), findsOneWidget);
    expect(find.text('120 points'), findsNothing);
    expect(find.text('Founding member'), findsNothing);
    expect(find.text('Reputation'), findsNothing);
    expect(find.text('Moderation hub'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Settings'),
      280,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('Settings'), findsOneWidget);
  });

  testWidgets('owner post card opens its post detail', (tester) async {
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
    );
    final postRepository = _MockPostRepository();
    final pendingPost = Completer<feed.Post>();
    when(
      () => postRepository.getPost(
        postId: 'owner-private-post',
        token: 'synthetic-token',
      ),
    ).thenAnswer((_) => pendingPost.future);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => user),
          ownerPostsServiceProvider.overrideWithValue(
            _FakeOwnerPostsService([
              OwnerPost(
                id: 'owner-private-post',
                authorId: user.id,
                body: 'Synthetic owner post',
                declaredCreationMode: 'human',
                moderationState: 'under_review',
                visibility: 'private',
                publishedAt: null,
                createdAt: DateTime(2026, 1, 1),
                updatedAt: DateTime(2026, 1, 1),
              ),
            ]),
          ),
          ownerProfileProvider.overrideWith(
            (ref) => Future.value(_ownerProfile(profile)),
          ),
          jwtProvider.overrideWith((ref) async => 'synthetic-token'),
          reputationProvider.overrideWith((ref) async => _reputationSnapshot),
          postRepositoryProvider.overrideWithValue(postRepository),
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Posts'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic owner post'), findsOneWidget);

    await tester.tap(find.text('Synthetic owner post'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.byType(PostDetailScreen), findsOneWidget);
    expect(find.text('Post'), findsOneWidget);
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
          ownerProfileProvider.overrideWith(
            (ref) => Future.error(Exception('no profile')),
          ),
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
      () => followService.follow(
        targetUserId: 'user-2',
        accessToken: 'token',
        idempotencyKey: any(named: 'idempotencyKey'),
        cancelToken: any(named: 'cancelToken'),
      ),
    ).thenAnswer(
      (_) async => const FollowMutationResult(
        targetUserId: 'user-2',
        created: true,
        removed: false,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => currentUser),
          publicUserProvider(
            profile.id,
          ).overrideWith((ref) => Future.value(profile)),
          followServiceProvider.overrideWith((ref) => followService),
          followStatusProvider(profile.id).overrideWith(
            (ref) => Future.value(const FollowStatus(following: false)),
          ),
          jwtProvider.overrideWith((ref) async => 'token'),
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          analyticsEventTrackerProvider.overrideWithValue(tracker),
        ],
        child: const MaterialApp(home: ProfileScreen(userId: 'user-2')),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Follow'));
    await tester.pump(const Duration(milliseconds: 50));

    verify(
      () => followService.follow(
        targetUserId: 'user-2',
        accessToken: 'token',
        idempotencyKey: any(named: 'idempotencyKey'),
        cancelToken: any(named: 'cancelToken'),
      ),
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
            profile.id,
          ).overrideWith((ref) => Future.value(profile)),
          followServiceProvider.overrideWith((ref) => followService),
          followStatusProvider(profile.id).overrideWith(
            (ref) => Future.value(const FollowStatus(following: false)),
          ),
          jwtProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: ProfileScreen(userId: 'user-2')),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Follow'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Sign in to follow accounts.'), findsOneWidget);
  });
}

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/profile/application/owner_comments.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/domain/owner_comment.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

import '../../../helpers/content_recovery.dart';

const _ownerId = '018f0000-0000-7000-8000-000000000001';
const _postId = '01900000-0000-7000-8000-000000000001';
const _body = 'Existing synthetic member note';
const _member = PublicUser(
  id: _ownerId,
  displayName: 'Casey Member',
  tier: 'bronze',
);

class _Posts extends OwnerPostsService {
  _Posts() : super(Dio());

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => OwnerPostsPage(
    items: [
      OwnerPost(
        id: _postId,
        authorId: _ownerId,
        body: _body,
        declaredCreationMode: 'human',
        moderationState: 'allowed',
        visibility: 'public',
        publishedAt: DateTime.utc(2026, 10, 1),
        createdAt: DateTime.utc(2026, 10, 1),
        updatedAt: DateTime.utc(2026, 10, 1),
      ),
    ],
    nextCursor: null,
  );
}

class _Comments extends OwnerCommentsService {
  _Comments() : super(Dio());

  @override
  Future<OwnerCommentsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => const OwnerCommentsPage(items: [], nextCursor: null);
}

class _Repository extends Mock implements PostRepository {}

class _Session extends StateNotifier<Object?> {
  _Session() : super(null);
}

void main() {
  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fallback'));
  });

  for (final width in [320.0, 390.0]) {
    testWidgets(
      '$width: owner Posts -> post -> author Posts -> Back preserves caller and enabled link',
      (tester) async {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final repo = _Repository();
        when(
          () => repo.getPost(
            postId: _postId,
            token: any(named: 'token'),
          ),
        ).thenAnswer(
          (_) async => domain.Post(
            id: _postId,
            authorId: _ownerId,
            authorUsername: _member.displayName,
            text: _body,
            createdAt: DateTime.utc(2026, 10, 1),
            moderationState: 'allowed',
            declaredCreationMode: 'human',
          ),
        );
        final router = GoRouter(
          initialLocation: '/?tab=profile&origin=synthetic-owner',
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) =>
                  state.uri.queryParameters['tab'] == 'profile'
                  ? const ProfileScreen()
                  : const Scaffold(body: Text('Discover caller')),
              routes: [
                GoRoute(
                  name: 'profile',
                  path: 'user/:userId',
                  builder: (context, state) =>
                      ProfileScreen(userId: state.pathParameters['userId']),
                ),
              ],
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              currentUserProvider.overrideWithValue(
                User(
                  id: _ownerId,
                  email: 'owner@example.invalid',
                  role: UserRole.user,
                  tier: UserTier.bronze,
                  reputationScore: 0,
                  createdAt: DateTime.utc(2026),
                  lastLoginAt: DateTime.utc(2026),
                ),
              ),
              authSessionRevisionProvider.overrideWith(
                (ref) => AuthSessionRevision(_Session()),
              ),
              jwtProvider.overrideWith((ref) async => 'synthetic-token'),
              ownerProfileProvider.overrideWith(
                (ref) async => const OwnerProfile(
                  user: _member,
                  moderationState: 'allowed',
                  publicVisibility: true,
                ),
              ),
              ownerPostsServiceProvider.overrideWithValue(_Posts()),
              ownerCommentsServiceProvider.overrideWithValue(_Comments()),
              settingsProvider.overrideWith((ref) => SettingsController()),
              analyticsClientProvider.overrideWithValue(
                const NullAnalyticsClient(),
              ),
              postRepositoryProvider.overrideWithValue(repo),
              contentRecoveryStorageProvider.overrideWithValue(
                MemoryContentRecoveryStorage(),
              ),
              reputationProvider.overrideWith(
                (ref) async => const ReputationState(
                  userId: _ownerId,
                  level: 0,
                  levelName: 'Member',
                  reputationStatus: 'active',
                  reputationBand: 'Getting started',
                  policyVersion: 'synthetic',
                  pillars: {},
                  promotionBlockers: [],
                ),
              ),
              monthlyRewardsViewProvider.overrideWith(
                (ref) async =>
                    throw StateError('Synthetic monthly view unavailable'),
              ),
            ],
            child: MaterialApp.router(
              routerConfig: router,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(disableAnimations: true),
                child: child!,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(Tab, 'Posts'));
        await tester.pumpAndSettle();
        final origin = router.routeInformationProvider.value.uri;
        expect(origin.queryParameters['tab'], 'profile');
        expect(origin.queryParameters['profileTab'], 'posts');
        await tester.tap(find.text(_body));
        await tester.pumpAndSettle();
        expect(find.byType(PostDetailScreen), findsOneWidget);
        await tester.tap(find.byTooltip('View Casey Member profile'));
        await tester.pumpAndSettle();
        expect(
          tester.widget<ProfileScreen>(find.byType(ProfileScreen).last).userId,
          _ownerId,
        );
        await tester.tap(find.widgetWithText(Tab, 'Posts').last);
        await tester.pumpAndSettle();
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.byType(PostDetailScreen), findsOneWidget);
        final link = find.descendant(
          of: find.byType(AuthorProfileLink),
          matching: find.byType(TextButton),
        );
        final enabledOnReturn =
            tester.widget<TextButton>(link).onPressed != null;
        expect(enabledOnReturn, isTrue);
        await tester.tap(link);
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(Tab, 'Comments').last);
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(Tab, 'Posts').last);
        await tester.pumpAndSettle();
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.byType(PostDetailScreen), findsOneWidget);
        expect(tester.widget<TextButton>(link).onPressed, isNotNull);
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(
          {
            'authorEnabled': enabledOnReturn,
            'uri': router.routeInformationProvider.value.uri.toString(),
            'ownerPosts': find
                .text('Your posts')
                .hitTestable()
                .evaluate()
                .isNotEmpty,
            'discover': find.text('Discover caller').evaluate().isNotEmpty,
          },
          {
            'authorEnabled': true,
            'uri': origin.toString(),
            'ownerPosts': true,
            'discover': false,
          },
        );
        verifyNever(
          () => repo.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}

/// Widget tests for PostDetailScreen.
///
/// Verifies loading, error, and success render states.
library;

import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';

class _MockPostRepository extends Mock implements PostRepository {}

domain.Post _fakePost({
  String id = 'post-1',
  String text = 'Hello world',
  String authorId = 'author-1',
  String authorUsername = 'testuser',
  String? moderationState,
}) {
  return domain.Post(
    id: id,
    authorId: authorId,
    authorUsername: authorUsername,
    text: text,
    createdAt: DateTime(2024),
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    trustStatus: 'clean',
    timeline: const domain.PostTrustTimeline(),
    isNews: false,
    userLiked: false,
    userDisliked: false,
    hasAppeal: false,
    proofSignalsProvided: false,
    verifiedContextBadgeEligible: false,
    featuredEligible: false,
    moderationState: moderationState,
  );
}

Widget _buildApp({required _MockPostRepository repo, String postId = 'p1'}) {
  return ProviderScope(
    overrides: [
      contentRecoveryStorageProvider.overrideWithValue(
        MemoryContentRecoveryStorage(),
      ),
      postRepositoryProvider.overrideWithValue(repo),
      jwtProvider.overrideWith((ref) async => 'test-token'),
    ],
    child: MaterialApp(home: PostDetailScreen(postId: postId)),
  );
}

User _viewer(String id) => User(
  id: id,
  email: 'member@example.test',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime(2026),
  lastLoginAt: DateTime(2026),
);

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    registerFallbackValue(
      domain.Post(
        id: 'fallback',
        authorId: 'a',
        authorUsername: 'u',
        text: 't',
        createdAt: DateTime(2024),
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
        trustStatus: 'clean',
        timeline: const domain.PostTrustTimeline(),
        isNews: false,
        userLiked: false,
        userDisliked: false,
        hasAppeal: false,
        proofSignalsProvided: false,
        verifiedContextBadgeEligible: false,
        featuredEligible: false,
      ),
    );
  });

  late _MockPostRepository repo;

  setUp(() {
    repo = _MockPostRepository();
  });

  // ── AppBar ─────────────────────────────────────────────────────────────────
  group('AppBar', () {
    testWidgets('shows "Post" title', (tester) async {
      final completer = Completer<domain.Post>();
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pump();

      expect(find.text('Post'), findsOneWidget);
      completer.complete(_fakePost());
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  group('Loading state', () {
    testWidgets('shows CircularProgressIndicator while fetching', (
      tester,
    ) async {
      final completer = Completer<domain.Post>();
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      completer.complete(_fakePost());
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────
  group('Error state', () {
    testWidgets('shows error UI with retry button when load fails', (
      tester,
    ) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenThrow(Exception('network error'));

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('retry button re-fetches post', (tester) async {
      var callCount = 0;
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) throw Exception('network error');
        return _fakePost();
      });

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('Hello world'), findsOneWidget);
      expect(callCount, 2);
    });
  });

  // ── Success state ──────────────────────────────────────────────────────────
  group('Success state', () {
    testWidgets('renders post text when loaded', (tester) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakePost(text: 'Post body content'));

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.text('Post body content'), findsOneWidget);
    });

    testWidgets('renders single-image media', (tester) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => domain.Post(
          id: 'post-appeal',
          authorId: 'author-1',
          authorUsername: 'testuser',
          text: 'Post with appeal',
          createdAt: DateTime(2024),
          likeCount: 0,
          dislikeCount: 0,
          commentCount: 3,
          mediaUrls: const ['https://example.com/one.png'],
          trustStatus: 'clean',
          timeline: const domain.PostTrustTimeline(),
          isNews: false,
          userLiked: false,
          userDisliked: false,
          hasAppeal: true,
          proofSignalsProvided: false,
          verifiedContextBadgeEligible: false,
          featuredEligible: false,
        ),
      );

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('shows RefreshIndicator', (tester) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakePost());

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.byType(RefreshIndicator), findsOneWidget);
    });

    testWidgets('shows author username in post header', (tester) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakePost());

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.textContaining('testuser'), findsOneWidget);
      expect(find.byTooltip('View testuser profile'), findsOneWidget);
    });

    testWidgets('uses safe owner label without reading a private profile', (
      tester,
    ) async {
      const authorId = '01a044e4-3860-7f76-b819-5be99e0000f6';
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => _fakePost(
          authorId: authorId,
          authorUsername: authorId,
          moderationState: 'under_review',
        ),
      );
      var ownerProfileReads = 0;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            postRepositoryProvider.overrideWithValue(repo),
            currentUserProvider.overrideWithValue(_viewer(authorId)),
            jwtProvider.overrideWith((ref) async => 'test-token'),
            ownerProfileProvider.overrideWith((ref) async {
              ownerProfileReads += 1;
              return const OwnerProfile(
                user: PublicUser(
                  id: 'owner-1',
                  displayName: 'Kyle Private',
                  handle: '@kyle',
                  tier: 'free',
                ),
                moderationState: 'under_review',
                publicVisibility: false,
              );
            }),
          ],
          child: const MaterialApp(home: PostDetailScreen(postId: 'p1')),
        ),
      );
      await tester.pumpAndSettle();

      expect(ownerProfileReads, 0);
      expect(find.text('Lythaus member'), findsOneWidget);
      expect(find.text(authorId), findsNothing);
    });

    testWidgets('does not read private owner profile for other viewers', (
      tester,
    ) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async =>
            _fakePost(authorId: 'owner-1', authorUsername: 'Lythaus member'),
      );
      var ownerProfileReads = 0;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            postRepositoryProvider.overrideWithValue(repo),
            currentUserProvider.overrideWithValue(_viewer('viewer-1')),
            jwtProvider.overrideWith((ref) async => 'test-token'),
            ownerProfileProvider.overrideWith((ref) async {
              ownerProfileReads += 1;
              return const OwnerProfile(
                user: PublicUser(
                  id: 'owner-1',
                  displayName: 'Private owner name',
                  tier: 'free',
                ),
                moderationState: 'under_review',
                publicVisibility: false,
              );
            }),
          ],
          child: const MaterialApp(home: PostDetailScreen(postId: 'p1')),
        ),
      );
      await tester.pumpAndSettle();

      expect(ownerProfileReads, 0);
      expect(find.text('Lythaus member'), findsOneWidget);
      expect(find.text('Private owner name'), findsNothing);
    });

    testWidgets('pending posts do not invite unavailable replies', (
      tester,
    ) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakePost(moderationState: 'under_review'));

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(
        find.text('Comments are unavailable while this post is under review.'),
        findsOneWidget,
      );
      expect(find.text('Comments (0)'), findsNothing);
    });

    testWidgets('post detail author link opens the existing profile route', (
      tester,
    ) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakePost());
      final router = GoRouter(
        initialLocation: '/post',
        routes: [
          GoRoute(
            path: '/post',
            builder: (context, state) => const PostDetailScreen(postId: 'p1'),
          ),
          GoRoute(
            name: 'profile',
            path: '/user/:userId',
            builder: (context, state) => Scaffold(
              body: Text('profile:${state.pathParameters['userId']}'),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            postRepositoryProvider.overrideWithValue(repo),
            jwtProvider.overrideWith((ref) async => 'test-token'),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('View testuser profile'));
      await tester.pumpAndSettle();

      expect(find.text('profile:author-1'), findsOneWidget);
    });

    testWidgets('renders horizontal media strip for multiple URLs', (
      tester,
    ) async {
      when(
        () => repo.getPost(
          postId: any(named: 'postId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => domain.Post(
          id: 'post-gallery',
          authorId: 'author-1',
          authorUsername: 'testuser',
          text: 'Gallery',
          createdAt: DateTime(2024),
          likeCount: 0,
          dislikeCount: 0,
          commentCount: 0,
          mediaUrls: const [
            'https://example.com/a.png',
            'https://example.com/b.png',
          ],
          trustStatus: 'clean',
          timeline: const domain.PostTrustTimeline(),
          isNews: false,
          userLiked: false,
          userDisliked: false,
          hasAppeal: false,
          proofSignalsProvided: false,
          verifiedContextBadgeEligible: false,
          featuredEligible: false,
        ),
      );

      await tester.pumpWidget(_buildApp(repo: repo));
      await tester.pumpAndSettle();

      expect(find.byType(ListView), findsWidgets);
      expect(find.byType(Image), findsNWidgets(2));
    });
  });
}

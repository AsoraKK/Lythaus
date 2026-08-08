/// Widget tests for PostDetailScreen.
///
/// Verifies loading, error, and success render states.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';

class _MockPostRepository extends Mock implements PostRepository {}

domain.Post _fakePost({String id = 'post-1', String text = 'Hello world'}) {
  return domain.Post(
    id: id,
    authorId: 'author-1',
    authorUsername: 'testuser',
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
  );
}

Widget _buildApp({required _MockPostRepository repo, String postId = 'p1'}) {
  return ProviderScope(
    overrides: [
      postRepositoryProvider.overrideWithValue(repo),
      jwtProvider.overrideWith((ref) async => 'test-token'),
    ],
    child: MaterialApp(home: PostDetailScreen(postId: postId)),
  );
}

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

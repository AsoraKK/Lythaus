/// Widget tests for CommentThreadScreen.
///
/// Verifies loading, empty, error, and comment-list render states.
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';

class _MockDio extends Mock implements Dio {}

// ── helpers ──────────────────────────────────────────────────────────────────

Response<Map<String, dynamic>> _commentPageResponse({
  List<Map<String, dynamic>> items = const [],
  String? nextCursor,
}) {
  return Response<Map<String, dynamic>>(
    data: {
      'items': items,
      if (nextCursor != null) 'meta': {'nextCursor': nextCursor},
    },
    statusCode: 200,
    requestOptions: RequestOptions(path: '/comments'),
  );
}

DioException _networkError(String path) => DioException(
  requestOptions: RequestOptions(path: path),
  message: 'network failure',
);

Map<String, dynamic> _commentJson(String id) => {
  'id': id,
  'text': 'Comment $id',
  'authorId': 'user-$id',
  'authorUsername': 'user$id',
  'avatarUrl': null,
  'createdAt': DateTime(2024).toIso8601String(),
  'replyCount': 0,
};

// ── test scaffold ─────────────────────────────────────────────────────────────

Widget _buildApp({
  required String postId,
  required _MockDio dio,
  String? jwtToken = 'test-token',
}) {
  return ProviderScope(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      jwtProvider.overrideWith((ref) async => jwtToken),
    ],
    child: MaterialApp(home: CommentThreadScreen(postId: postId)),
  );
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    registerFallbackValue(Options());
  });

  late _MockDio dio;

  setUp(() {
    dio = _MockDio();
  });

  // ── AppBar ─────────────────────────────────────────────────────────────────
  group('AppBar', () {
    testWidgets('shows "Comments" title', (tester) async {
      // Hang the initial load so we can inspect the static UI.
      final completer = Completer<Response<Map<String, dynamic>>>();
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pump();

      expect(find.text('Comments'), findsOneWidget);
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  group('Loading state', () {
    testWidgets('shows CircularProgressIndicator while fetching', (
      tester,
    ) async {
      final completer = Completer<Response<Map<String, dynamic>>>();
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pump(); // run initial microtask but keep awaiting

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      completer.complete(_commentPageResponse());
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────
  group('Empty state', () {
    testWidgets('shows empty message when no comments returned', (
      tester,
    ) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse(items: []));

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.textContaining('No comments'), findsOneWidget);
    });

    testWidgets('shows RefreshIndicator for pull-to-refresh', (tester) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse(items: []));

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.byType(RefreshIndicator), findsOneWidget);
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────
  group('Error state', () {
    testWidgets('shows MaterialBanner with retry on network error', (
      tester,
    ) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_networkError('/comments'));

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.byType(MaterialBanner), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows POST_NOT_FOUND message from API error response', (
      tester,
    ) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/comments'),
          response: Response<Map<String, dynamic>>(
            data: {'code': 'POST_NOT_FOUND'},
            statusCode: 404,
            requestOptions: RequestOptions(path: '/comments'),
          ),
        ),
      );

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.textContaining('unavailable'), findsOneWidget);
    });

    testWidgets('Retry button re-fetches comments', (tester) async {
      var callCount = 0;
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) throw _networkError('/comments');
        return _commentPageResponse(items: []);
      });

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      // First load fails — banner shown
      expect(find.byType(MaterialBanner), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      // Second call succeeds — banner gone, empty message shown
      expect(find.byType(MaterialBanner), findsNothing);
      expect(callCount, 2);
    });
  });

  // ── Comment list ───────────────────────────────────────────────────────────
  group('Comment list', () {
    testWidgets('renders comments returned by API', (tester) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _commentPageResponse(
          items: [_commentJson('a1'), _commentJson('a2')],
        ),
      );

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.textContaining('Comment a1'), findsOneWidget);
      expect(find.textContaining('Comment a2'), findsOneWidget);
    });
  });

  // ── Composer bar ───────────────────────────────────────────────────────────
  group('Composer bar', () {
    testWidgets('composer text field is present', (tester) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse());

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('send button triggers post when text is non-empty', (
      tester,
    ) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse());

      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: {'comment': _commentJson('new1')},
          statusCode: 201,
          requestOptions: RequestOptions(path: '/comments'),
        ),
      );

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Hello world');
      await tester.pump();

      final sendBtn = find.byIcon(Icons.send);
      expect(sendBtn, findsOneWidget);
      await tester.tap(sendBtn);
      await tester.pumpAndSettle();

      // Post was submitted
      verify(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).called(1);
    });

    testWidgets('sign-in snackbar shown when no jwt token', (tester) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse());

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            secureDioProvider.overrideWithValue(dio),
            jwtProvider.overrideWith((ref) async => null),
          ],
          child: const MaterialApp(home: CommentThreadScreen(postId: 'p1')),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();

      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.textContaining('Sign in'), findsOneWidget);
    });

    testWidgets('shows daily comment limit message on throttled create', (
      tester,
    ) async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _commentPageResponse());

      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/comments'),
          response: Response<Map<String, dynamic>>(
            data: {
              'code': 'DAILY_COMMENT_LIMIT_EXCEEDED',
              'message':
                  'You have reached your daily comment limit. Please try again tomorrow.',
            },
            statusCode: 429,
            requestOptions: RequestOptions(path: '/comments'),
          ),
        ),
      );

      await tester.pumpWidget(_buildApp(postId: 'p1', dio: dio));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Hello world');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();

      expect(find.byType(MaterialBanner), findsOneWidget);
      expect(
        find.text(
          'You have reached your daily comment limit. Please try again tomorrow.',
        ),
        findsOneWidget,
      );
    });
  });
}

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import '../../helpers/feed_session.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';
import 'package:lythaus/features/reactions/presentation/reaction_bar.dart';

class _ReactionSuccessAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final body = {
      'postId': 'post-1',
      if (options.method == 'DELETE')
        'removed': true
      else
        'reactionType': (options.data as Map)['reactionType'],
      'changed': true,
    };
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _makeSuccessDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = _ReactionSuccessAdapter();
  return dio;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Wraps [widget] in a [ProviderScope] + [MaterialApp].
Widget _wrap(Widget widget, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith(
        (ref) => FeedTestAuth(feedTestUser('reader')),
      ),
      jwtProvider.overrideWith((ref) async => 'fixture-token'),
      ...overrides,
    ],
    child: MaterialApp(home: Scaffold(body: widget)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

void main() {
  group('ReactionBar', () {
    testWidgets(
      'guest controls are read-only without creating an uncertain write',
      (tester) async {
        await tester.pumpWidget(
          _wrap(
            const ReactionBar(contentId: 'post-1', authorUserId: 'writer'),
            overrides: [
              authStateProvider.overrideWith((ref) => FeedTestAuth(null)),
            ],
          ),
        );
        final container = ProviderScope.containerOf(
          tester.element(find.byType(ReactionBar)),
        );
        expect(
          tester
              .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, 'Like'),
              )
              .onPressed,
          isNull,
        );
        expect(
          find.text('Sign in to react to this contribution.'),
          findsOneWidget,
        );
        expect(container.read(pendingFeedActionsProvider), isEmpty);
      },
    );
    testWidgets('renders canonical reaction chips', (tester) async {
      await tester.pumpWidget(
        _wrap(const ReactionBar(contentId: 'post-1', authorUserId: 'author-1')),
      );

      expect(find.text('Like'), findsOneWidget);
      expect(find.text('Insightful'), findsOneWidget);
      expect(find.text('Support'), findsOneWidget);
    });

    testWidgets('displays non-zero counts from initialSummary', (tester) async {
      const summary = ReactionSummary(counts: {'like': 12, 'support': 3});

      await tester.pumpWidget(
        _wrap(
          const ReactionBar(
            contentId: 'post-1',
            authorUserId: 'author-1',
            initialSummary: summary,
          ),
        ),
      );

      expect(find.text('Like 12'), findsOneWidget);
      expect(find.text('Support 3'), findsOneWidget);
    });

    testWidgets('tap reaction increments then second tap toggles it off', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          const ReactionBar(contentId: 'post-1', authorUserId: 'author-1'),
          overrides: [secureDioProvider.overrideWithValue(_makeSuccessDio())],
        ),
      );

      await tester.tap(find.text('Like'));
      await tester.pumpAndSettle();
      expect(find.text('Like 1'), findsOneWidget);

      await tester.tap(find.text('Like 1'));
      await tester.pumpAndSettle();
      expect(find.text('Like'), findsOneWidget);
      expect(find.text('Like 1'), findsNothing);
    });
    testWidgets(
      'repeated removal sends fresh authenticated requests and synchronizes feed',
      (tester) async {
        final dio = _makeSuccessDio();
        await tester.pumpWidget(
          _wrap(
            const ReactionBar(contentId: 'post-1', authorUserId: 'writer'),
            overrides: [secureDioProvider.overrideWithValue(dio)],
          ),
        );
        for (var i = 0; i < 2; i++) {
          await tester.tap(find.text('Insightful'));
          await tester.pumpAndSettle();
          final container = ProviderScope.containerOf(
            tester.element(find.byType(ReactionBar)),
          );
          expect(container.read(confirmedUsefulProvider)['post-1'], isTrue);
          await tester.tap(find.text('Insightful 1'));
          await tester.pumpAndSettle();
          expect(container.read(confirmedUsefulProvider)['post-1'], isFalse);
        }
        final requests =
            (dio.httpClientAdapter as _ReactionSuccessAdapter).requests;
        expect(requests.map((request) => request.method), [
          'POST',
          'DELETE',
          'POST',
          'DELETE',
        ]);
        expect(
          requests.every(
            (request) =>
                request.headers['Authorization'] == 'Bearer fixture-token',
          ),
          isTrue,
        );
      },
    );
    testWidgets('pending report cannot be overwritten by a detail reaction', (
      tester,
    ) async {
      final dio = _makeSuccessDio();
      await tester.pumpWidget(
        _wrap(
          const ReactionBar(contentId: 'post-1', authorUserId: 'writer'),
          overrides: [secureDioProvider.overrideWithValue(dio)],
        ),
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byType(ReactionBar)),
      );
      container.read(pendingFeedActionsProvider.notifier).state = {
        'post-1': 'report',
      };
      await tester.pump();
      expect(
        tester
            .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Like'))
            .onPressed,
        isNull,
      );
      expect(
        (dio.httpClientAdapter as _ReactionSuccessAdapter).requests,
        isEmpty,
      );
      expect(container.read(pendingFeedActionsProvider)['post-1'], 'report');
    });
  });
}

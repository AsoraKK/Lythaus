import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';
import 'package:lythaus/features/reactions/presentation/reaction_bar.dart';

class _ReactionSuccessAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final body = {'postId': 'post-1', 'reactionType': 'like', 'changed': true};
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
    overrides: overrides,
    child: MaterialApp(home: Scaffold(body: widget)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

void main() {
  group('ReactionBar', () {
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
  });
}

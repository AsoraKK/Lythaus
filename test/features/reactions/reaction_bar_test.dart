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
    final body = {
      'reactionId': 'rxn-1',
      'reactionType': 'helpful',
      'includedInReputation': true,
      'antiGamingStatus': 'clear',
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
    overrides: overrides,
    child: MaterialApp(home: Scaffold(body: widget)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

void main() {
  group('ReactionBar', () {
    testWidgets('renders all four positive reaction chips by default', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(const ReactionBar(contentId: 'post-1', authorUserId: 'author-1')),
      );

      expect(find.text('Helpful'), findsOneWidget);
      expect(find.text('Well Sourced'), findsOneWidget);
      expect(find.text('Thoughtful'), findsOneWidget);
      expect(find.text('Agree'), findsOneWidget);
    });

    testWidgets('negative reactions are hidden by default', (tester) async {
      await tester.pumpWidget(
        _wrap(const ReactionBar(contentId: 'post-1', authorUserId: 'author-1')),
      );

      expect(find.text('Disagree'), findsNothing);
      expect(find.text('Misleading'), findsNothing);
      expect(find.text('Low Effort'), findsNothing);
      expect(find.text('Report'), findsNothing);
    });

    testWidgets('toggle reveals negative reactions', (tester) async {
      await tester.pumpWidget(
        _wrap(const ReactionBar(contentId: 'post-1', authorUserId: 'author-1')),
      );

      // Tap the expand arrow
      await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
      await tester.pumpAndSettle();

      expect(find.text('Disagree'), findsOneWidget);
      expect(find.text('Misleading'), findsOneWidget);
      expect(find.text('Report'), findsOneWidget);
    });

    testWidgets('toggle collapses negative reactions on second tap', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(const ReactionBar(contentId: 'post-1', authorUserId: 'author-1')),
      );

      await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
      await tester.pumpAndSettle();
      expect(find.text('Misleading'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.keyboard_arrow_up));
      await tester.pumpAndSettle();
      expect(find.text('Misleading'), findsNothing);
    });

    testWidgets('displays non-zero counts from initialSummary', (tester) async {
      const summary = ReactionSummary(counts: {'helpful': 12, 'agree': 3});

      await tester.pumpWidget(
        _wrap(
          const ReactionBar(
            contentId: 'post-1',
            authorUserId: 'author-1',
            initialSummary: summary,
          ),
        ),
      );

      expect(find.text('Helpful 12'), findsOneWidget);
      expect(find.text('Agree 3'), findsOneWidget);
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

      await tester.tap(find.text('Helpful'));
      await tester.pumpAndSettle();
      expect(find.text('Helpful 1'), findsOneWidget);

      await tester.tap(find.text('Helpful 1'));
      await tester.pumpAndSettle();
      expect(find.text('Helpful'), findsOneWidget);
      expect(find.text('Helpful 1'), findsNothing);
    });
  });
}

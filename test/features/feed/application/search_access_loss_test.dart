import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_service.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';

ResponseBody _page(String id, {String? cursor}) => ResponseBody.fromString(
  jsonEncode({
    'items': [
      {
        'id': id,
        'authorId': 'synthetic-author',
        'authorUsername': 'Synthetic author',
        'text': 'Synthetic result $id',
        'createdAt': '2026-10-23T00:00:00Z',
      },
    ],
    'nextCursor': cursor,
  }),
  200,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

ResponseBody _denied(int status) => ResponseBody.fromString(
  jsonEncode({'error': 'synthetic-denial'}),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

class _Adapter implements HttpClientAdapter {
  _Adapter(this.status);
  final int? status;
  final cursors = <Object?>[];
  bool fail = true;
  Completer<ResponseBody>? delayed;
  final pageStarted = Completer<void>();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final cursor = options.queryParameters['cursor'];
    cursors.add(cursor);
    if (cursor == null) return _page('first', cursor: 'page-2');
    if (!pageStarted.isCompleted) pageStarted.complete();
    if (delayed != null) return delayed!.future;
    if (!fail) return _page('second');
    if (status == null) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    return _denied(status!);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  for (final status in [401, 403, 404, 500, null]) {
    test(
      'search pagination handles access/transport response $status',
      () async {
        final adapter = _Adapter(status);
        final dio = Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter;
        addTearDown(dio.close);
        final container = ProviderContainer(
          overrides: [
            jwtProvider.overrideWith((_) async => 'synthetic-token'),
            socialFeedServiceProvider.overrideWithValue(SocialFeedService(dio)),
          ],
        );
        addTearDown(container.dispose);
        final provider = feedSearchProvider((tag: 'civic', tokenVersion: 0));
        final subscription = container.listen(provider, (_, _) {});
        addTearDown(subscription.close);
        await container.read(provider.future);
        final notifier = container.read(provider.notifier);
        await expectLater(
          notifier.loadMore(),
          throwsA(
            status == 401
                ? isA<AuthRequiredException>()
                : isA<SocialFeedException>(),
          ),
        );
        final state = container.read(provider);
        if (status == 401 || status == 403 || status == 404) {
          expect(state.hasError, isTrue);
          expect(state.valueOrNull?.posts ?? [], isEmpty);
          expect(state.valueOrNull?.hasMore ?? false, isFalse);
          await notifier.loadMore();
          expect(adapter.cursors, [null, 'page-2']);
          adapter.fail = false;
          await notifier.refresh();
          expect(
            container.read(provider).requireValue.posts.single.id,
            'first',
          );
          expect(adapter.cursors, [null, 'page-2', null]);
        } else {
          expect(state.requireValue.posts.single.id, 'first');
          expect(state.requireValue.nextCursor, 'page-2');
          adapter.fail = false;
          await notifier.loadMore();
          expect(
            container.read(provider).requireValue.posts.map((post) => post.id),
            ['first', 'second'],
          );
          expect(adapter.cursors, [null, 'page-2', 'page-2']);
        }
      },
    );
  }

  testWidgets(
    'expired search pagination shows sign-in recovery instead of page retry',
    (tester) async {
      final adapter = _Adapter(401);
      final dio = Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
        ..httpClientAdapter = adapter;
      addTearDown(dio.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            jwtProvider.overrideWith((_) async => 'synthetic-token'),
            socialFeedServiceProvider.overrideWithValue(SocialFeedService(dio)),
          ],
          child: const MaterialApp(
            home: FeedSearchScreen(initialQuery: 'civic'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Synthetic result first'), findsOneWidget);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic result first'), findsNothing);
      expect(find.text('Retry loading more'), findsNothing);
      expect(find.text('Sign in'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final status in [401, 403]) {
    test('late search denial $status cannot clear refreshed results', () async {
      final adapter = _Adapter(status)..delayed = Completer<ResponseBody>();
      final dio = Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
        ..httpClientAdapter = adapter;
      addTearDown(dio.close);
      final container = ProviderContainer(
        overrides: [
          jwtProvider.overrideWith((_) async => 'synthetic-token'),
          socialFeedServiceProvider.overrideWithValue(SocialFeedService(dio)),
        ],
      );
      addTearDown(container.dispose);
      final provider = feedSearchProvider((tag: 'civic', tokenVersion: 0));
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await container.read(provider.future);
      final notifier = container.read(provider.notifier);
      final pending = notifier.loadMore();
      await adapter.pageStarted.future;
      expect(adapter.cursors, [null, 'page-2']);
      await notifier.refresh();
      adapter.delayed!.complete(_denied(status));
      await pending;
      expect(container.read(provider).hasError, isFalse);
      expect(container.read(provider).requireValue.posts.single.id, 'first');
    });
  }
}

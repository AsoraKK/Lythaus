import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/reactions/application/reaction_providers.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';

class _JsonAdapter implements HttpClientAdapter {
  _JsonAdapter(this._handler);

  final ResponseBody Function(RequestOptions options) _handler;
  RequestOptions? lastOptions;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastOptions = options;
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _makeDio(_JsonAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}

void main() {
  group('submitReactionProvider', () {
    test('posts request and parses response', () async {
      final adapter = _JsonAdapter((options) {
        expect(options.path, '/posts/post-1/reactions');
        expect(options.method, 'POST');
        expect(options.data, {'reactionType': 'like'});
        expect(
          options.headers['Idempotency-Key'],
          startsWith('reaction-create-'),
        );

        return ResponseBody.fromString(
          jsonEncode({
            'postId': 'post-1',
            'reactionType': 'like',
            'changed': true,
          }),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final container = ProviderContainer(
        overrides: [secureDioProvider.overrideWithValue(_makeDio(adapter))],
      );

      final result = await container.read(
        submitReactionProvider(
          const SubmitReactionRequest(postId: 'post-1', reactionType: 'like'),
        ).future,
      );

      expect(result.postId, 'post-1');
      expect(result.reactionType, 'like');
      expect(result.changed, isTrue);
    });

    test('throws on empty response payload', () async {
      final adapter = _JsonAdapter((_) {
        return ResponseBody.fromString(
          'null',
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final container = ProviderContainer(
        overrides: [secureDioProvider.overrideWithValue(_makeDio(adapter))],
      );

      expect(
        () => container.read(
          submitReactionProvider(
            const SubmitReactionRequest(postId: 'post-1', reactionType: 'like'),
          ).future,
        ),
        throwsA(isA<StateError>()),
      );
    });
  });

  group('deleteReactionProvider', () {
    test('calls DELETE /reactions/{id}', () async {
      final adapter = _JsonAdapter((options) {
        return ResponseBody.fromString(
          '{}',
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final container = ProviderContainer(
        overrides: [secureDioProvider.overrideWithValue(_makeDio(adapter))],
      );

      await container.read(deleteReactionProvider('post-1').future);

      expect(adapter.lastOptions, isNotNull);
      expect(adapter.lastOptions!.method, 'DELETE');
      expect(adapter.lastOptions!.path, '/posts/post-1/reactions');
      expect(
        adapter.lastOptions!.headers['Idempotency-Key'],
        startsWith('reaction-delete-'),
      );
    });
  });
}

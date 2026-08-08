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
        expect(options.path, '/reactions');
        expect(options.method, 'POST');
        expect(options.data, {
          'targetContentId': 'post-1',
          'targetUserId': 'user-2',
          'reactionType': 'helpful',
        });

        return ResponseBody.fromString(
          jsonEncode({
            'reactionId': 'rxn-1',
            'reactionType': 'helpful',
            'includedInReputation': true,
            'antiGamingStatus': 'clear',
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
          const SubmitReactionRequest(
            targetContentId: 'post-1',
            targetUserId: 'user-2',
            reactionType: 'helpful',
          ),
        ).future,
      );

      expect(result.reactionId, 'rxn-1');
      expect(result.reactionType, 'helpful');
      expect(result.includedInReputation, isTrue);
      expect(result.antiGamingStatus, 'clear');
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
            const SubmitReactionRequest(
              targetContentId: 'post-1',
              targetUserId: 'user-2',
              reactionType: 'helpful',
            ),
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

      await container.read(deleteReactionProvider('rxn-99').future);

      expect(adapter.lastOptions, isNotNull);
      expect(adapter.lastOptions!.method, 'DELETE');
      expect(adapter.lastOptions!.path, '/reactions/rxn-99');
    });
  });
}

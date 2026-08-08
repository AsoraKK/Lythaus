import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';

// ─── Helpers ───

/// Adapter returning fixed JSON.
class _MockAdapter implements HttpClientAdapter {
  final Map<String, dynamic> Function(String path) responder;
  _MockAdapter(this.responder);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final data = responder(options.path);
    return ResponseBody.fromString(
      jsonEncode(data),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _ErrorAdapter implements HttpClientAdapter {
  final int statusCode;
  _ErrorAdapter(this.statusCode);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException(
      requestOptions: options,
      response: Response(requestOptions: options, statusCode: statusCode),
      type: DioExceptionType.badResponse,
    );
  }

  @override
  void close({bool force = false}) {}
}

class _CaptureAdapter implements HttpClientAdapter {
  RequestOptions? lastRequestOptions;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequestOptions = options;
    return ResponseBody.fromString(
      '{}',
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _makeDio(_MockAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}

void main() {
  // ─── publicUserProvider ───

  group('publicUserProvider', () {
    test('fetches and parses user', () async {
      final adapter = _MockAdapter((path) {
        return {
          'user': {
            'id': 'u1',
            'displayName': 'Alice',
            'tier': 'free',
            'reputationScore': 42,
            'badges': ['verified'],
          },
        };
      });

      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => 'test-token'),
        ],
      );

      final user = await container.read(publicUserProvider('u1').future);
      expect(user.id, 'u1');
      expect(user.displayName, 'Alice');
      expect(user.reputationScore, 42);
      expect(user.badges, contains('verified'));
    });

    test('allows guest profile fetch when no token', () async {
      final adapter = _MockAdapter((_) {
        return {
          'user': {'id': 'u1', 'displayName': 'Guest', 'tier': 'free'},
        };
      });
      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => null),
        ],
      );

      final user = await container.read(publicUserProvider('u1').future);
      expect(user.displayName, 'Guest');
    });

    test('allows guest profile fetch when token is empty', () async {
      final adapter = _MockAdapter((_) {
        return {
          'user': {'id': 'u1', 'displayName': 'Guest', 'tier': 'free'},
        };
      });
      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => ''),
        ],
      );

      final user = await container.read(publicUserProvider('u1').future);
      expect(user.displayName, 'Guest');
    });

    test('throws when response data is null', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.httpClientAdapter = _ErrorAdapter(404);

      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(dio),
          jwtProvider.overrideWith((_) async => 'tok'),
        ],
      );

      expect(
        () => container.read(publicUserProvider('u1').future),
        throwsA(isA<DioException>()),
      );
    });
  });

  // ─── trustPassportProvider ───

  group('trustPassportProvider', () {
    test('fetches and parses passport with data envelope', () async {
      final adapter = _MockAdapter((path) {
        return {
          'data': {
            'userId': 'u2',
            'transparencyStreakCategory': 'Consistent',
            'appealsResolvedFairlyLabel': 'Fair',
            'jurorReliabilityTier': 'Silver',
            'counts': {
              'transparency': {'totalPosts': 10, 'postsWithSignals': 5},
              'appeals': {'resolved': 3, 'approved': 2, 'rejected': 1},
              'juror': {'votesCast': 20, 'alignedVotes': 18},
            },
          },
        };
      });

      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => 'test-token'),
        ],
      );

      final passport = await container.read(trustPassportProvider('u2').future);
      expect(passport.userId, 'u2');
      expect(passport.transparencyStreakCategory, 'Consistent');
      expect(passport.jurorReliabilityTier, 'Silver');
      expect(passport.counts.totalPosts, 10);
      expect(passport.counts.alignedVotes, 18);
    });

    test('allows guest trust passport fetch when no token', () async {
      final adapter = _MockAdapter((_) {
        return {
          'userId': 'u1',
          'transparencyStreakCategory': 'Rare',
          'appealsResolvedFairlyLabel': 'Appeals resolved fairly',
          'jurorReliabilityTier': 'Bronze',
          'counts': <String, dynamic>{},
        };
      });
      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => null),
        ],
      );

      final passport = await container.read(trustPassportProvider('u1').future);
      expect(passport.userId, 'u1');
    });

    test(
      'parses passport when data is plain Map (not Map<String,dynamic>)',
      () async {
        final adapter = _MockAdapter((path) {
          // Return data as a Map (will be decoded as Map<String,dynamic> by JSON)
          return {
            'data': {
              'userId': 'u3',
              'transparencyStreakCategory': 'Rare',
              'appealsResolvedFairlyLabel': 'Appeals resolved fairly',
              'jurorReliabilityTier': 'Bronze',
              'counts': <String, dynamic>{},
            },
          };
        });

        final container = ProviderContainer(
          overrides: [
            secureDioProvider.overrideWithValue(_makeDio(adapter)),
            jwtProvider.overrideWith((_) async => 'test-token'),
          ],
        );

        final passport = await container.read(
          trustPassportProvider('u3').future,
        );
        expect(passport.userId, 'u3');
      },
    );

    test('falls back to top-level data when no data key', () async {
      final adapter = _MockAdapter((path) {
        return {
          'userId': 'u4',
          'transparencyStreakCategory': 'Rare',
          'appealsResolvedFairlyLabel': 'Fair',
          'jurorReliabilityTier': 'Bronze',
          'counts': <String, dynamic>{},
        };
      });

      final container = ProviderContainer(
        overrides: [
          secureDioProvider.overrideWithValue(_makeDio(adapter)),
          jwtProvider.overrideWith((_) async => 'test-token'),
        ],
      );

      final passport = await container.read(trustPassportProvider('u4').future);
      expect(passport.userId, 'u4');
    });
  });

  group('ProfilePreferencesService', () {
    test('updates trust passport visibility via users/me patch', () async {
      final adapter = _CaptureAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.httpClientAdapter = adapter;
      final service = ProfilePreferencesService(dio);

      await service.updateTrustPassportVisibility(
        accessToken: 'token-1',
        visibility: 'public_expanded',
      );

      expect(adapter.lastRequestOptions?.method, 'PATCH');
      expect(adapter.lastRequestOptions?.path, '/api/users/me');
      expect(
        adapter.lastRequestOptions?.headers['Authorization'],
        'Bearer token-1',
      );
      expect(adapter.lastRequestOptions?.data, {
        'trustPassportVisibility': 'public_expanded',
      });
    });

    test('rejects unsupported trust passport visibility values', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      final service = ProfilePreferencesService(dio);

      expect(
        () => service.updateTrustPassportVisibility(
          accessToken: 'token-1',
          visibility: 'friends_only',
        ),
        throwsArgumentError,
      );
    });
  });
}

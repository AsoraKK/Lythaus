import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _ok(
  Map<String, dynamic> data,
  String path, {
  int statusCode = 200,
}) {
  return Response<Map<String, dynamic>>(
    data: data,
    statusCode: statusCode,
    requestOptions: RequestOptions(path: path),
  );
}

DioException _dioError(
  String path, {
  int? statusCode,
  Map<String, dynamic>? data,
  Map<String, String>? headers,
}) {
  final ro = RequestOptions(path: path);
  return DioException(
    requestOptions: ro,
    response: statusCode != null
        ? Response(
            data: data,
            statusCode: statusCode,
            requestOptions: ro,
            headers: headers != null
                ? Headers.fromMap(headers.map((k, v) => MapEntry(k, [v])))
                : Headers(),
          )
        : null,
    message: 'mock error',
  );
}

Map<String, dynamic> _postJson({String id = 'p1'}) => {
  'id': id,
  'text': 'hello',
  'authorId': 'u1',
  'authorUsername': 'user1',
  'createdAt': DateTime(2024, 1, 1).toIso8601String(),
};

void main() {
  late MockDio dio;
  late PostRepositoryImpl repo;

  setUp(() {
    dio = MockDio();
    repo = PostRepositoryImpl(dio);
  });

  // ────── createPost ──────

  group('createPost', () {
    test('returns success on 201', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _ok(_postJson(), '/api/posts', statusCode: 201),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostSuccess>());
    });

    test('returns error on unexpected status', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _ok(_postJson(), '/api/posts', statusCode: 202),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'unexpected_status');
    });

    test('returns error on generic exception', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('boom'));

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
    });
  });

  // ────── updatePost ──────

  group('updatePost', () {
    test('returns error when request is empty', () async {
      final result = await repo.updatePost(
        postId: 'p1',
        request: const UpdatePostRequest(),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'invalid_request');
    });

    test('returns success on 200', () async {
      when(
        () => dio.patch<Map<String, dynamic>>(
          '/api/posts/p1',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async =>
            _ok({'post': _postJson()}, '/api/posts/p1', statusCode: 200),
      );

      final result = await repo.updatePost(
        postId: 'p1',
        request: const UpdatePostRequest(text: 'updated'),
        token: 't',
      );
      expect(result, isA<CreatePostSuccess>());
    });

    test('returns error on unexpected status', () async {
      when(
        () => dio.patch<Map<String, dynamic>>(
          '/api/posts/p1',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _ok(_postJson(), '/api/posts/p1', statusCode: 202),
      );

      final result = await repo.updatePost(
        postId: 'p1',
        request: const UpdatePostRequest(text: 'updated'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
    });

    test('returns error on generic exception', () async {
      when(
        () => dio.patch<Map<String, dynamic>>(
          '/api/posts/p1',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('boom'));

      final result = await repo.updatePost(
        postId: 'p1',
        request: const UpdatePostRequest(text: 'updated'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
    });
  });

  // ────── deletePost ──────

  group('deletePost', () {
    test('returns true on 204', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          statusCode: 204,
          requestOptions: RequestOptions(path: '/api/posts/p1'),
        ),
      );

      expect(await repo.deletePost(postId: 'p1', token: 't'), isTrue);
    });

    test('returns true on 200 with success map', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          data: <String, dynamic>{'success': true},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/posts/p1'),
        ),
      );

      expect(await repo.deletePost(postId: 'p1', token: 't'), isTrue);
    });

    test('returns false on 200 with success=false', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          data: <String, dynamic>{'success': false},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/posts/p1'),
        ),
      );

      expect(await repo.deletePost(postId: 'p1', token: 't'), isFalse);
    });

    test('returns false on 200 with non-map data', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          data: 'ok',
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/posts/p1'),
        ),
      );

      expect(await repo.deletePost(postId: 'p1', token: 't'), isFalse);
    });

    test('throws PostException on unexpected status', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          statusCode: 500,
          requestOptions: RequestOptions(path: '/api/posts/p1'),
        ),
      );

      expect(
        () => repo.deletePost(postId: 'p1', token: 't'),
        throwsA(isA<PostException>()),
      );
    });

    test('throws PostException on DioException', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts/p1'));

      expect(
        () => repo.deletePost(postId: 'p1', token: 't'),
        throwsA(isA<PostException>()),
      );
    });
  });

  // ────── getPost ──────

  group('getPost', () {
    test('returns post on 200', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _ok({'post': _postJson()}, '/api/posts/p1'));

      final post = await repo.getPost(postId: 'p1', token: 't');
      expect(post.id, 'p1');
    });

    test('throws on unexpected status', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _ok(_postJson(), '/api/posts/p1', statusCode: 500),
      );

      expect(() => repo.getPost(postId: 'p1'), throwsA(isA<PostException>()));
    });

    test('throws not_found on 404 DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts/p1', statusCode: 404));

      expect(
        () => repo.getPost(postId: 'p1'),
        throwsA(
          isA<PostException>().having((e) => e.code, 'code', 'not_found'),
        ),
      );
    });

    test('throws network_error on other DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts/p1', statusCode: 502));

      expect(
        () => repo.getPost(postId: 'p1'),
        throwsA(
          isA<PostException>().having((e) => e.code, 'code', 'network_error'),
        ),
      );
    });
  });

  // ────── _handleDioError branches ──────

  group('_handleDioError via createPost', () {
    test('network error without response', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts'),
          message: 'timeout',
        ),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'network_error');
    });

    test('400 CONTENT_BLOCKED returns CreatePostBlocked', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/posts',
          statusCode: 400,
          data: {
            'code': 'CONTENT_BLOCKED',
            'message': 'blocked',
            'details': {
              'categories': ['hate'],
            },
          },
        ),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostBlocked>());
      expect((result as CreatePostBlocked).categories, contains('hate'));
    });

    test(
      '429 daily_post_limit_reached returns CreatePostLimitExceeded',
      () async {
        when(
          () => dio.post<Map<String, dynamic>>(
            '/api/posts',
            data: any(named: 'data'),
            options: any(named: 'options'),
          ),
        ).thenThrow(
          _dioError(
            '/api/posts',
            statusCode: 429,
            data: {
              'code': 'daily_post_limit_reached',
              'message': 'limit hit',
              'details': {'limit': 10, 'current': 10, 'tier': 'free'},
            },
          ),
        );

        final result = await repo.createPost(
          request: const CreatePostRequest(text: 'hello'),
          token: 't',
        );
        expect(result, isA<CreatePostLimitExceeded>());
        final limited = result as CreatePostLimitExceeded;
        expect(limited.limit, 10);
        expect(limited.tier, 'free');
      },
    );

    test('401 returns auth_required error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts', statusCode: 401));

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'auth_required');
    });

    test('403 device integrity blocked', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/posts',
          statusCode: 403,
          data: {'code': 'DEVICE_INTEGRITY_BLOCKED'},
        ),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'DEVICE_INTEGRITY_BLOCKED');
    });

    test('403 forbidden', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts', statusCode: 403, data: {}));

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'forbidden');
    });

    test('404 returns not_found error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/posts', statusCode: 404));

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'not_found');
    });

    test('500 returns api_error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/posts',
          statusCode: 500,
          data: {'message': 'server error'},
        ),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'api_error');
    });

    test('400 validation error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/posts',
          statusCode: 400,
          data: {'code': 'invalid_field', 'message': 'text required'},
        ),
      );

      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'hello'),
        token: 't',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).code, 'invalid_field');
    });
  });

  // ────── _errorPayload ──────

  group('_errorPayload via _extractErrorMessage', () {
    test('extracts from nested error object', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/posts/p1',
          statusCode: 500,
          data: {
            'error': {'message': 'nested msg'},
          },
        ),
      );

      expect(
        () => repo.deletePost(postId: 'p1', token: 't'),
        throwsA(
          isA<PostException>().having(
            (e) => e.message,
            'message',
            'nested msg',
          ),
        ),
      );
    });

    test('falls back to die message when no payload', () async {
      when(
        () => dio.delete<dynamic>(
          '/api/posts/p1',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/p1'),
          response: Response(
            data: 'not a map',
            statusCode: 500,
            requestOptions: RequestOptions(path: '/api/posts/p1'),
          ),
          message: 'network msg',
        ),
      );

      expect(
        () => repo.deletePost(postId: 'p1', token: 't'),
        throwsA(isA<PostException>()),
      );
    });
  });
}

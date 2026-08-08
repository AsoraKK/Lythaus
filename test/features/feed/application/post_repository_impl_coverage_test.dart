import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/core/error/error_codes.dart';

/// Helper to build a DioException with a mocked response.
DioException _dioError(
  int? statusCode, {
  Map<String, dynamic>? data,
  Map<String, List<String>>? headers,
}) {
  final requestOptions = RequestOptions(path: '/api/posts');
  final response = statusCode != null
      ? Response(
          requestOptions: requestOptions,
          statusCode: statusCode,
          data: data,
          headers: Headers.fromMap(headers ?? {}),
        )
      : null;
  return DioException(
    requestOptions: requestOptions,
    response: response,
    type: response == null
        ? DioExceptionType.connectionError
        : DioExceptionType.badResponse,
    message: 'test error',
  );
}

void main() {
  late PostRepositoryImpl repo;
  late Dio dio;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    repo = PostRepositoryImpl(dio);
  });

  group('_handleDioError (via createPost)', () {
    // We exercise _handleDioError indirectly by providing a mock adapter

    test('network error (null response)', () async {
      dio.httpClientAdapter = _FakeAdapter(error: _dioError(null));
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'network_error');
    });

    test('content blocked (400 CONTENT_BLOCKED)', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          400,
          data: {
            'code': 'CONTENT_BLOCKED',
            'message': 'Blocked',
            'details': {
              'categories': ['hate', 'violence'],
            },
          },
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostBlocked>());
      final blocked = result as CreatePostBlocked;
      expect(blocked.categories, ['hate', 'violence']);
      expect(blocked.code, 'CONTENT_BLOCKED');
    });

    test('content blocked (422 AI_CONTENT_BLOCKED)', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          422,
          data: {'code': ErrorCodes.aiContentBlocked, 'message': 'AI blocked'},
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostBlocked>());
    });

    test('content blocked (400 AI_LABEL_REQUIRED)', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          400,
          data: {
            'code': ErrorCodes.aiLabelRequired,
            'message': 'Label required',
          },
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostBlocked>());
    });

    test('daily limit exceeded (429)', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          429,
          data: {
            'code': 'daily_post_limit_reached',
            'message': 'Limit reached',
            'details': {'limit': 10, 'current': 10, 'tier': 'free'},
          },
          headers: {
            'retry-after': ['3600'],
          },
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostLimitExceeded>());
      final limited = result as CreatePostLimitExceeded;
      expect(limited.limit, 10);
      expect(limited.tier, 'free');
      expect(limited.retryAfter.inSeconds, 3600);
    });

    test('400 validation error without content_blocked', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          400,
          data: {'code': 'validation_error', 'message': 'Bad input'},
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'validation_error');
      expect(err.message, 'Bad input');
    });

    test('401 returns auth_required', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(401, data: {'message': 'Unauthorized'}),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'auth_required');
      expect(err.message, 'Authentication required');
    });

    test('403 generic returns forbidden', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(403, data: {'message': 'Forbidden'}),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'forbidden');
    });

    test('403 with DEVICE_INTEGRITY_BLOCKED code', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          403,
          data: {
            'code': ErrorCodes.deviceIntegrityBlocked,
            'message': 'Device blocked',
          },
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, ErrorCodes.deviceIntegrityBlocked);
    });

    test('404 returns not_found', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(404, data: {'message': 'Not found'}),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'not_found');
      expect(err.message, 'User not found');
    });

    test('500 returns api_error with extracted message', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(500, data: {'message': 'Internal server error'}),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'api_error');
    });

    test('error payload in nested error object', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          400,
          data: {
            'error': {
              'code': 'CONTENT_BLOCKED',
              'message': 'Nested error',
              'details': {
                'categories': ['spam'],
              },
            },
          },
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostBlocked>());
      final blocked = result as CreatePostBlocked;
      expect(blocked.message, 'Nested error');
      expect(blocked.categories, ['spam']);
    });

    test('429 without daily_post_limit_reached code falls through', () async {
      dio.httpClientAdapter = _FakeAdapter(
        error: _dioError(
          429,
          data: {'code': 'rate_limited', 'message': 'Rate limited'},
        ),
      );
      final result = await repo.createPost(
        request: const CreatePostRequest(text: 'test'),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.code, 'api_error');
    });
  });

  group('updatePost', () {
    test('empty request returns error', () async {
      final result = await repo.updatePost(
        postId: 'p1',
        request: const UpdatePostRequest(),
        token: 'tok',
      );
      expect(result, isA<CreatePostError>());
      final err = result as CreatePostError;
      expect(err.message, 'No post updates were provided');
    });
  });
}

/// Adapter that throws a DioException for every request
class _FakeAdapter implements HttpClientAdapter {
  final DioException error;
  _FakeAdapter({required this.error});

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw error;
  }

  @override
  void close({bool force = false}) {}
}

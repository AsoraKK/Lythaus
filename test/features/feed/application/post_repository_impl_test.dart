import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

class MockDio extends Mock implements Dio {}

Map<String, dynamic> _postJson(String id) {
  return {
    'id': id,
    'authorId': 'author-$id',
    'authorUsername': 'author-$id',
    'text': 'post $id',
    'createdAt': DateTime(2024, 1, 1).toIso8601String(),
  };
}

Response<Map<String, dynamic>> _response(
  Object data,
  String path, {
  int? statusCode,
}) {
  return Response<Map<String, dynamic>>(
    data: data as Map<String, dynamic>,
    statusCode: statusCode,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  late MockDio dio;
  late PostRepositoryImpl repo;

  setUp(() {
    dio = MockDio();
    repo = PostRepositoryImpl(dio);
  });

  test('createPost returns success on 201', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(_postJson('p1'), '/api/posts', statusCode: 201),
    );

    final result = await repo.createPost(
      request: const CreatePostRequest(text: 'hello'),
      token: 't1',
    );

    expect(result, isA<CreatePostSuccess>());
    expect((result as CreatePostSuccess).post.id, 'p1');
  });

  test('createPost maps blocked and limit errors', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/posts'),
        response: _response(
          {
            'code': 'CONTENT_BLOCKED',
            'message': 'Blocked',
            'details': {
              'categories': ['spam'],
            },
          },
          '/api/posts',
          statusCode: 400,
        ),
      ),
    );

    final blocked = await repo.createPost(
      request: const CreatePostRequest(text: 'bad'),
      token: 't1',
    );
    expect(blocked, isA<CreatePostBlocked>());

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/posts'),
        response: Response(
          data: {
            'code': 'daily_post_limit_reached',
            'message': 'Limit hit',
            'details': {'limit': 10, 'current': 10, 'tier': 'free'},
          },
          statusCode: 429,
          headers: Headers.fromMap({
            'retry-after': ['3600'],
          }),
          requestOptions: RequestOptions(path: '/api/posts'),
        ),
      ),
    );

    final limited = await repo.createPost(
      request: const CreatePostRequest(text: 'limit'),
      token: 't1',
    );
    expect(limited, isA<CreatePostLimitExceeded>());
    expect((limited as CreatePostLimitExceeded).retryAfter.inSeconds, 3600);
  });

  test('createPost handles unexpected status', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(_postJson('p2'), '/api/posts', statusCode: 200),
    );

    final result = await repo.createPost(
      request: const CreatePostRequest(text: 'hello'),
      token: 't1',
    );

    expect(result, isA<CreatePostError>());
  });

  test('updatePost returns success and maps blocked errors', () async {
    when(
      () => dio.patch<Map<String, dynamic>>(
        '/api/posts/p1',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(_postJson('p1'), '/api/posts/p1', statusCode: 200),
    );

    final success = await repo.updatePost(
      postId: 'p1',
      request: const UpdatePostRequest(text: 'updated'),
      token: 't1',
    );
    expect(success, isA<CreatePostSuccess>());

    when(
      () => dio.patch<Map<String, dynamic>>(
        '/api/posts/p1',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/posts/p1'),
        response: _response(
          {
            'code': 'AI_LABEL_REQUIRED',
            'message': 'Potential AI-generated content must be labeled.',
            'details': {
              'categories': ['ai_generated'],
            },
          },
          '/api/posts/p1',
          statusCode: 400,
        ),
      ),
    );

    final blocked = await repo.updatePost(
      postId: 'p1',
      request: const UpdatePostRequest(text: 'bad'),
      token: 't1',
    );
    expect(blocked, isA<CreatePostBlocked>());
  });

  test('deletePost success and failure', () async {
    when(
      () =>
          dio.delete<dynamic>('/api/posts/p1', options: any(named: 'options')),
    ).thenAnswer(
      (_) async =>
          _response(<String, dynamic>{}, '/api/posts/p1', statusCode: 204),
    );

    final ok = await repo.deletePost(postId: 'p1', token: 't1');
    expect(ok, isTrue);

    when(
      () =>
          dio.delete<dynamic>('/api/posts/p2', options: any(named: 'options')),
    ).thenAnswer(
      (_) async =>
          _response({'success': false}, '/api/posts/p2', statusCode: 500),
    );

    expect(
      () => repo.deletePost(postId: 'p2', token: 't1'),
      throwsA(isA<PostException>()),
    );
  });

  test('getPost returns post and handles 404', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/posts/p3',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {'post': _postJson('p3')},
        '/api/posts/p3',
        statusCode: 200,
      ),
    );

    final post = await repo.getPost(postId: 'p3', token: 't1');
    expect(post.id, 'p3');

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/posts/missing',
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/posts/missing'),
        response: _response(
          {'message': 'missing'},
          '/api/posts/missing',
          statusCode: 404,
        ),
      ),
    );

    expect(
      () => repo.getPost(postId: 'missing', token: 't1'),
      throwsA(isA<PostException>()),
    );
  });
}

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/services/post_service.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Object data,
  String path, {
  int? statusCode,
}) {
  return Response<Map<String, dynamic>>(
    data: data as Map<String, dynamic>,
    statusCode: statusCode ?? 200,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  test('PostService createPost returns response on 201', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'success': true,
          'postId': 'post-1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
        '/api/posts',
        statusCode: 201,
      ),
    );

    final result = await service.createPost(
      text: 'hello',
      mediaUrl: 'https://example.com/image.png',
      token: 'token',
    );

    expect(result.success, true);
    expect(result.postId, 'post-1');
  });

  test('PostService createPost throws when status is not 201', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/posts',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': false}, '/api/posts', statusCode: 400),
    );

    await expectLater(
      service.createPost(text: 'hello', token: 'token'),
      throwsA(isA<DioException>()),
    );
  });

  test('PostService deletePost returns response on success', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.delete<Map<String, dynamic>>(
        '/api/posts/post-1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response(<String, dynamic>{}, '/api/posts/post-1', statusCode: 204),
    );

    final result = await service.deletePost(postId: 'post-1', token: 'token');
    expect(result['success'], true);
    expect(result['postId'], 'post-1');
  });

  test('PostService deletePost throws on failure', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.delete<Map<String, dynamic>>(
        '/api/posts/post-1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': false}, '/api/posts/post-1', statusCode: 403),
    );

    await expectLater(
      service.deletePost(postId: 'post-1', token: 'token'),
      throwsA(isA<DioException>()),
    );
  });

  test('PostService getFeed returns FeedResponse on 200', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/feed',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'success': true,
          'feed': [
            {'id': 'post-1'},
          ],
          'nextCursor': 'next',
        },
        '/api/feed',
        statusCode: 200,
      ),
    );

    final feed = await service.getFeed(limit: 5, cursor: 'c1', token: 'token');
    expect(feed.success, true);
    expect(feed.feed, hasLength(1));
    expect(feed.nextCursor, 'next');
  });

  test('PostService getFeed throws on non-200', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/feed',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': false}, '/api/feed', statusCode: 500),
    );

    await expectLater(service.getFeed(), throwsA(isA<DioException>()));
  });

  test('PostService getUserProfile returns data on 200', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/user/user-1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'success': true,
          'user': {
            'id': 'user-1',
            'displayName': 'Ada',
            'createdAt': '2024-01-01T00:00:00Z',
            'tier': 'premium',
            'stats': {'postsCount': 1},
            'isOwnProfile': false,
          },
        },
        '/api/user/user-1',
        statusCode: 200,
      ),
    );

    final profile = await service.getUserProfile(
      userId: 'user-1',
      token: 'token',
    );
    expect(profile.user.id, 'user-1');
  });

  test('PostService getUserProfile throws on non-200', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/user',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': false}, '/api/user', statusCode: 404),
    );

    await expectLater(
      service.getUserProfile(token: 'token'),
      throwsA(isA<DioException>()),
    );
  });

  test('PostService checkHealth returns data on 200', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(() => dio.get<Map<String, dynamic>>('/api/health')).thenAnswer(
      (_) async => _response({'status': 'ok'}, '/api/health', statusCode: 200),
    );

    final result = await service.checkHealth();
    expect(result['status'], 'ok');
  });

  test('PostService checkHealth throws on failure', () async {
    final dio = MockDio();
    final service = PostService(dio);

    when(() => dio.get<Map<String, dynamic>>('/api/health')).thenAnswer(
      (_) async =>
          _response({'status': 'down'}, '/api/health', statusCode: 500),
    );

    await expectLater(service.checkHealth(), throwsA(isA<DioException>()));
  });
}

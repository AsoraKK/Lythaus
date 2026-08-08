import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/application/social_feed_service.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';

class MockDio extends Mock implements Dio {}

Map<String, dynamic> _postJson(String id) {
  return {
    'id': id,
    'authorId': 'author-$id',
    'authorUsername': 'author-$id',
    'text': 'Post $id',
    'createdAt': DateTime(2024, 1, 1).toIso8601String(),
  };
}

Response<Map<String, dynamic>> _response(Object data, String path) {
  return Response<Map<String, dynamic>>(
    data: data as Map<String, dynamic>,
    statusCode: 200,
    requestOptions: RequestOptions(path: path),
  );
}

Map<String, dynamic> _feedData({String? nextCursor}) {
  return {
    'posts': [_postJson('p1')],
    'totalCount': 1,
    'hasMore': nextCursor != null,
    'nextCursor': nextCursor,
    'page': 1,
    'pageSize': 20,
  };
}

void main() {
  late MockDio dio;
  late SocialFeedService service;

  setUp(() {
    dio = MockDio();
    service = SocialFeedService(dio, baseUrl: '');
  });

  test('cursor feeds parse posts and cursors', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/discover',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [_postJson('p1')],
        'nextCursor': 'next',
      }, '/feed/discover'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/news',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [_postJson('p2')],
        'nextCursor': null,
      }, '/feed/news'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/user/user-1',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [_postJson('p3')],
        'nextCursor': 'next-user',
      }, '/feed/user/user-1'),
    );

    final discover = await service.getDiscoverFeed(
      cursor: 'c1',
      limit: 5,
      token: 't1',
    );
    expect(discover.posts, hasLength(1));
    expect(discover.nextCursor, 'next');

    final news = await service.getNewsFeed(token: 't1');
    expect(news.posts.first.id, 'p2');
    expect(news.nextCursor, isNull);

    final userFeed = await service.getUserFeed(
      userId: 'user-1',
      includeReplies: true,
      token: 't1',
    );
    expect(userFeed.nextCursor, 'next-user');

    final captured =
        verify(
              () => dio.get<Map<String, dynamic>>(
                '/feed/user/user-1',
                queryParameters: captureAny(named: 'queryParameters'),
                options: any(named: 'options'),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(captured['includeReplies'], 'true');
  });

  test('getFeed handles success and failure', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': true, 'data': _feedData()}, '/feed'),
    );

    final response = await service.getFeed(
      params: const FeedParams(type: FeedType.notable),
      token: 't1',
    );
    expect(response.posts, hasLength(1));

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': false, 'message': 'nope'}, '/feed'),
    );

    expect(
      () => service.getFeed(
        params: const FeedParams(type: FeedType.notable),
        token: 't1',
      ),
      throwsA(isA<SocialFeedException>()),
    );
  });

  test('list feeds use shared response handler', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/trending',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': true, 'data': _feedData()}, '/feed/trending'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/local',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': true, 'data': _feedData()}, '/feed/local'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/new-creators',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'data': _feedData(),
      }, '/feed/new-creators'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/following',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': true, 'data': _feedData()}, '/feed/following'),
    );

    final trending = await service.getTrendingFeed(page: 1, token: 't1');
    final local = await service.getLocalFeed(
      location: 'Cape Town',
      token: 't1',
    );
    final creators = await service.getNewCreatorsFeed(token: 't1');
    final following = await service.getFollowingFeed(token: 't1');

    expect(trending.posts, hasLength(1));
    expect(local.posts, hasLength(1));
    expect(creators.posts, hasLength(1));
    expect(following.posts, hasLength(1));
  });

  test('post actions and comments parse correctly', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/posts/post-1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'post': _postJson('post-1'),
      }, '/posts/post-1'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/posts/post-1/like',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'post': _postJson('post-1'),
      }, '/posts/post-1/like'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/posts/post-1/dislike',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'post': _postJson('post-1'),
      }, '/posts/post-1/dislike'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/posts/post-1/comments',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'comments': [
          {
            'id': 'c1',
            'postId': 'post-1',
            'authorId': 'a1',
            'authorUsername': 'user1',
            'text': 'hello',
            'createdAt': DateTime(2024, 1, 1).toIso8601String(),
          },
        ],
      }, '/posts/post-1/comments'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/posts/post-1/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': true}, '/posts/post-1/flag'),
    );

    final post = await service.getPost(postId: 'post-1', token: 't1');
    final liked = await service.likePost(
      postId: 'post-1',
      isLike: true,
      token: 't1',
    );
    final disliked = await service.dislikePost(
      postId: 'post-1',
      isDislike: true,
      token: 't1',
    );
    final comments = await service.getComments(postId: 'post-1', token: 't1');
    await service.flagPost(postId: 'post-1', reason: 'spam', token: 't1');

    expect(post.id, 'post-1');
    expect(liked.id, 'post-1');
    expect(disliked.id, 'post-1');
    expect(comments, hasLength(1));
  });

  test('throws on invalid response and network error', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/discover',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) async => _response('bad', '/feed/discover'));

    expect(
      () => service.getDiscoverFeed(),
      throwsA(isA<SocialFeedException>()),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/trending',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/feed/trending'),
        message: 'boom',
      ),
    );

    expect(
      () => service.getTrendingFeed(),
      throwsA(isA<SocialFeedException>()),
    );
  });
}

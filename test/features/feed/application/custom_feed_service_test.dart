import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/application/custom_feed_service.dart';
import 'package:lythaus/state/models/feed_models.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Map<String, dynamic> data,
  String path, {
  int? statusCode,
}) {
  return Response<Map<String, dynamic>>(
    data: data,
    statusCode: statusCode,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  late MockDio dio;
  late CustomFeedService service;

  setUp(() {
    dio = MockDio();
    service = CustomFeedService(dio);
  });

  test('listCustomFeeds parses custom feed definitions', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/custom-feeds',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [
          {
            'id': 'custom::1',
            'name': 'Policy Desk',
            'contentType': 'text',
            'sorting': 'newest',
            'includeKeywords': <String>['policy'],
            'excludeKeywords': <String>['spam'],
            'includeAccounts': <String>['u1'],
            'excludeAccounts': <String>[],
            'isHome': true,
          },
        ],
      }, '/api/custom-feeds'),
    );

    final feeds = await service.listCustomFeeds(token: 't1');

    expect(feeds, hasLength(1));
    expect(feeds.first.id, 'custom::1');
    expect(feeds.first.type, FeedType.custom);
    expect(feeds.first.sorting, SortingRule.newest);
    expect(feeds.first.refinements.includeKeywords, <String>['policy']);
    expect(feeds.first.isHome, isTrue);
  });

  test('getCustomFeedItems parses posts and cursor', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/custom-feeds/custom::1/items',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [
          {
            'id': 'p1',
            'authorId': 'u1',
            'authorUsername': 'anna',
            'text': 'hello',
            'createdAt': DateTime(2024, 1, 1).toIso8601String(),
          },
        ],
        'nextCursor': 'cursor_1',
      }, '/api/custom-feeds/custom::1/items'),
    );

    final result = await service.getCustomFeedItems(
      token: 't1',
      feedId: 'custom::1',
    );

    expect(result.posts, hasLength(1));
    expect(result.posts.first.id, 'p1');
    expect(result.nextCursor, 'cursor_1');
    expect(result.hasMore, isTrue);
  });

  test('createCustomFeed maps draft payload and parses response', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/custom-feeds',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'id': 'custom::9',
          'name': 'My Feed',
          'contentType': 'mixed',
          'sorting': 'relevant',
          'includeKeywords': <String>['ai'],
          'excludeKeywords': <String>[],
          'includeAccounts': <String>[],
          'excludeAccounts': <String>[],
          'isHome': false,
        },
        '/api/custom-feeds',
        statusCode: 201,
      ),
    );

    final created = await service.createCustomFeed(
      token: 't1',
      draft: const CustomFeedDraft(
        name: 'My Feed',
        contentType: ContentType.mixed,
        sorting: SortingRule.relevant,
        refinements: FeedRefinements(includeKeywords: <String>['ai']),
      ),
    );

    expect(created.id, 'custom::9');
    expect(created.name, 'My Feed');
    expect(created.type, FeedType.custom);
    verify(
      () => dio.post<Map<String, dynamic>>(
        '/api/custom-feeds',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).called(1);
  });

  test('getCustomFeedItems passes cursor when provided', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/custom-feeds/custom::2/items',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': <Map<String, dynamic>>[],
        'nextCursor': null,
      }, '/api/custom-feeds/custom::2/items'),
    );

    final result = await service.getCustomFeedItems(
      token: 't1',
      feedId: 'custom::2',
      cursor: 'abc123',
    );

    expect(result.posts, isEmpty);
  });

  test('listCustomFeeds handles missing id in feed definition', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/custom-feeds',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'items': [
          {'name': 'No-ID Feed', 'contentType': 'text', 'sorting': 'hot'},
        ],
      }, '/api/custom-feeds'),
    );

    final feeds = await service.listCustomFeeds(token: 't1');

    expect(feeds, hasLength(1));
    expect(feeds.first.id, startsWith('custom-'));
    expect(feeds.first.sorting, SortingRule.hot);
  });

  test('createCustomFeed with SortingRule.hot', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/custom-feeds',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'id': 'custom::hot',
          'name': 'Hot Feed',
          'contentType': 'mixed',
          'sorting': 'hot',
        },
        '/api/custom-feeds',
        statusCode: 201,
      ),
    );

    final created = await service.createCustomFeed(
      token: 't1',
      draft: const CustomFeedDraft(
        name: 'Hot Feed',
        contentType: ContentType.mixed,
        sorting: SortingRule.hot,
        refinements: FeedRefinements(),
      ),
    );

    expect(created.id, 'custom::hot');
    expect(created.sorting, SortingRule.hot);
  });

  test('createCustomFeed with SortingRule.local', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/custom-feeds',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response(
        {
          'id': 'custom::local',
          'name': 'Local Feed',
          'contentType': 'mixed',
          'sorting': 'local',
        },
        '/api/custom-feeds',
        statusCode: 201,
      ),
    );

    final created = await service.createCustomFeed(
      token: 't1',
      draft: const CustomFeedDraft(
        name: 'Local Feed',
        contentType: ContentType.mixed,
        sorting: SortingRule.local,
        refinements: FeedRefinements(),
      ),
    );

    expect(created.id, 'custom::local');
    expect(created.sorting, SortingRule.local);
  });
}

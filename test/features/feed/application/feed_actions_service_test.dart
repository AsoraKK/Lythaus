import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/state/models/post_feed_item_mapper.dart';

void main() {
  late Dio dio;
  late FeedActionsService service;
  late List<RequestOptions> requests;
  Object? response;
  setUp(() {
    requests = [];
    dio = Dio(BaseOptions(baseUrl: 'https://fixture.invalid/api'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          requests.add(request);
          handler.resolve(
            Response(requestOptions: request, statusCode: 200, data: response),
          );
        },
      ),
    );
    service = FeedActionsService(dio);
  });
  test('bookmark state is read from the canonical private list', () async {
    response = {
      'items': [
        {'postId': 'p1'},
      ],
    };
    expect(await service.bookmarks('token'), {'p1'});
    expect(requests.single.uri.path, '/api/bookmarks');
    expect(requests.single.headers['Authorization'], 'Bearer token');
  });
  test('invalid bookmark state does not become an empty list', () async {
    response = {
      'items': [
        {'id': 'wrong-field'},
      ],
    };
    await expectLater(service.bookmarks('token'), throwsStateError);
  });
  test('bookmark success must confirm the target and state', () async {
    response = {'postId': 'p1', 'bookmarked': true};
    await service.bookmark('p1', true, 'token');
    expect(requests.single.data, {'postId': 'p1'});
    expect(requests.single.headers['Idempotency-Key'], isNotEmpty);
    response = {'postId': 'p2', 'bookmarked': true};
    await expectLater(service.bookmark('p1', true, 'token'), throwsStateError);
  });
  test('bookmark removal must confirm false', () async {
    response = {'postId': 'p1', 'bookmarked': false};
    await service.bookmark('p1', false, 'token');
    expect(requests.single.method, 'DELETE');
    expect(requests.single.uri.path, '/api/bookmarks/p1');
  });
  test('Useful sends insightful, never a negative reaction', () async {
    response = {'postId': 'p1', 'reactionType': 'insightful', 'changed': true};
    await service.useful('p1', true, 'token');
    expect(requests.single.data, {'reactionType': 'insightful'});
  });
  test(
    'repeated useful removal makes independent confirmed requests',
    () async {
      response = {'postId': 'p1', 'removed': true};
      await service.useful('p1', false, 'token');
      await service.useful('p1', false, 'token');
      expect(requests.length, 2);
      expect(
        requests.first.headers['Idempotency-Key'],
        isNot(requests.last.headers['Idempotency-Key']),
      );
    },
  );
  test('mute requires a confirmed target, not only HTTP success', () async {
    response = {'userId': 'a', 'muted': false};
    await expectLater(service.mute('a', 'token'), throwsStateError);
    response = {'userId': 'a', 'muted': true};
    await service.mute('a', 'token');
  });
  test('reconciliation reads the confirmed Useful state', () async {
    response = {
      'post': {'id': 'p1', 'viewerReaction': 'insightful'},
    };
    expect(await service.readUseful('p1', 'token'), isTrue);
    response = {
      'post': {'id': 'p1', 'viewerReaction': null},
    };
    expect(await service.readUseful('p1', 'token'), isFalse);
    response = {
      'post': {'id': 'p1'},
    };
    await expectLater(service.readUseful('p1', 'token'), throwsStateError);
  });
  test('mute reconciliation validates target identities', () async {
    response = {
      'items': [
        {'userId': 'writer'},
      ],
    };
    expect(await service.readMutes('token'), {'writer'});
    response = {
      'items': [
        {'id': 'wrong'},
      ],
    };
    await expectLater(service.readMutes('token'), throwsStateError);
  });
  test('category and fallback never fabricate a headline', () {
    final post = Post.fromJson({
      'id': 'p',
      'body': 'Text only',
      'category': 'news',
    });
    final item = mapPostToFeedItem(
      post,
      feedId: 'discover',
      fallbackTitle: 'Update',
    );
    expect(item.title, '');
    expect(item.imageUrl, isNull);
    expect(item.interactionPostId, 'p');
  });
  test(
    'News keeps publication identity and separate backing post identity',
    () {
      final post = Post.fromJson({
        'id': 'publication',
        'post_id': 'post',
        'title': 'Real headline',
      });
      final item = mapPostToFeedItem(
        post,
        feedId: 'news',
        fallbackTitle: 'News',
      );
      expect(item.id, 'publication');
      expect(item.interactionPostId, 'post');
      expect(item.title, 'Real headline');
      final unbacked = Post.fromJson({
        'id': 'publication',
        'post_id': null,
        'title': 'Bulletin',
      });
      expect(
        mapPostToFeedItem(
          unbacked,
          feedId: 'news',
          fallbackTitle: '',
        ).interactionPostId,
        isNull,
      );
    },
  );
}

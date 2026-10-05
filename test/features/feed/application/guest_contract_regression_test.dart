import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_service.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';

class _Dio extends Mock implements Dio {}

void main() {
  for (final status in <int?>[404, null]) {
    test('feed status $status remains distinct from authentication', () async {
      final dio = _Dio();
      final request = RequestOptions(path: '/api/feed');
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: request,
          response: status == null
              ? null
              : Response(statusCode: status, requestOptions: request),
        ),
      );
      await expectLater(
        SocialFeedService(
          dio,
          baseUrl: '',
        ).getFeed(params: const FeedParams(type: FeedType.notable)),
        throwsA(
          isA<SocialFeedException>().having(
            (e) => e.code,
            'code',
            status == 404 ? 'FEED_UNAVAILABLE' : 'NETWORK_ERROR',
          ),
        ),
      );
    });
    test(
      'notification status $status remains distinct from authentication',
      () async {
        final dio = _Dio();
        final request = RequestOptions(path: '/notifications');
        when(
          () => dio.get<Map<String, dynamic>>(
            '/notifications',
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenThrow(
          DioException(
            requestOptions: request,
            message: 'offline',
            response: status == null
                ? null
                : Response(statusCode: status, requestOptions: request),
          ),
        );
        await expectLater(
          NotificationApiService(dioClient: dio).getNotifications(),
          throwsA(
            status == 404
                ? isA<NotificationServiceUnavailable>()
                : predicate((Object e) => e.toString().contains('offline')),
          ),
        );
      },
    );
  }
  test('guest tag search uses the public discovery endpoint', () async {
    final dio = _Dio();
    final request = RequestOptions(path: '/feed/discover');
    when(
      () => dio.get<Map<String, dynamic>>(
        '/feed/discover',
        queryParameters: any(named: 'queryParameters'),
        cancelToken: any(named: 'cancelToken'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {
          'items': [
            {
              'id': 'post-1',
              'authorId': 'author-1',
              'authorUsername': 'public-author',
              'body': 'Public #water update',
              'publishedAt': '2025-01-01T00:00:00.000Z',
            },
          ],
          'nextCursor': null,
        },
        statusCode: 200,
        requestOptions: request,
      ),
    );
    final container = ProviderContainer(
      overrides: [
        guestModeProvider.overrideWith((ref) => true),
        jwtProvider.overrideWith((ref) async => null),
        socialFeedServiceProvider.overrideWithValue(
          SocialFeedService(dio, baseUrl: ''),
        ),
      ],
    );
    addTearDown(container.dispose);
    final result = await container.read(
      feedSearchProvider((tag: 'water', tokenVersion: 0)).future,
    );
    expect(result.posts.single.id, 'post-1');
    final captured = verify(
      () => dio.get<Map<String, dynamic>>(
        '/feed/discover',
        queryParameters: captureAny(named: 'queryParameters'),
        cancelToken: any(named: 'cancelToken'),
        options: captureAny(named: 'options'),
      ),
    ).captured;
    final query = captured[0] as Map<String, dynamic>;
    final options = captured[1] as Options;
    expect(query['tag'], 'water');
    expect(options.headers?['Authorization'], isNull);
  });

  test(
    'Trending has no native handler and never makes an HTTP request',
    () async {
      final dio = _Dio();
      await expectLater(
        SocialFeedService(dio, baseUrl: '').getTrendingFeed(),
        throwsA(
          isA<SocialFeedException>().having(
            (e) => e.code,
            'code',
            'TRENDING_UNAVAILABLE',
          ),
        ),
      );
      verifyZeroInteractions(dio);
    },
  );

  test('feed 401 is authentication required, not a network outage', () async {
    final dio = _Dio();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/feed'),
        response: Response(
          statusCode: 401,
          requestOptions: RequestOptions(path: '/api/feed'),
        ),
      ),
    );
    await expectLater(
      SocialFeedService(
        dio,
        baseUrl: '',
      ).getFeed(params: const FeedParams(type: FeedType.notable)),
      throwsA(predicate((Object e) => e.toString().contains('Sign in'))),
    );
  });

  test(
    'notification 401 handles native structured errors as authentication',
    () async {
      final dio = _Dio();
      when(
        () => dio.get<Map<String, dynamic>>(
          '/notifications',
          queryParameters: any(named: 'queryParameters'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/notifications'),
          response: Response(
            statusCode: 401,
            data: {
              'error': {'code': 'unauthorized'},
            },
            requestOptions: RequestOptions(path: '/notifications'),
          ),
        ),
      );
      await expectLater(
        NotificationApiService(dioClient: dio).getNotifications(),
        throwsA(predicate((Object e) => e.toString().contains('Sign in'))),
      );
    },
  );
}

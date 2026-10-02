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
  test(
    'guest search explains authentication without a protected request',
    () async {
      final dio = _Dio();
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
      await expectLater(
        container.read(feedSearchProvider('water').future),
        throwsA(predicate((Object e) => e.toString().contains('Sign in'))),
      );
      verifyZeroInteractions(dio);
    },
  );

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

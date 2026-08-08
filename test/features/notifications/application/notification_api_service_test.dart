import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Object data,
  String path, {
  int? statusCode,
}) {
  final map = Map<String, dynamic>.from(data as Map);
  return Response<Map<String, dynamic>>(
    data: map,
    statusCode: statusCode ?? 200,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
    registerFallbackValue(RequestOptions(path: ''));
  });

  test('getNotifications parses list response', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'notifications': [
          {
            'id': 'n1',
            'userId': 'u1',
            'category': 'SOCIAL',
            'eventType': 'COMMENT_CREATED',
            'title': 'Hello',
            'body': 'World',
            'read': false,
            'dismissed': false,
            'createdAt': '2024-01-01T00:00:00Z',
          },
        ],
        'continuationToken': 'next',
        'totalUnread': 3,
      }, '/notifications'),
    );

    final result = await service.getNotifications(limit: 10);
    expect(result.notifications.length, 1);
    expect(result.continuationToken, 'next');
    expect(result.totalUnread, 3);
  });

  test('getUnreadCount returns zero when count missing', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>('/notifications/unread-count'),
    ).thenAnswer((_) async => _response({}, '/notifications/unread-count'));

    final count = await service.getUnreadCount();
    expect(count, 0);
  });

  test('getUnreadCount reads unreadCount key', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>('/notifications/unread-count'),
    ).thenAnswer(
      (_) async => _response({'unreadCount': 4}, '/notifications/unread-count'),
    );

    final count = await service.getUnreadCount();
    expect(count, 4);
  });

  test('markAsRead posts to endpoint', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.post<Map<String, dynamic>>('/notifications/n1/read'),
    ).thenAnswer((_) async => _response({}, '/notifications/n1/read'));

    await service.markAsRead('n1');

    verify(
      () => dio.post<Map<String, dynamic>>('/notifications/n1/read'),
    ).called(1);
  });

  test('dismissNotification posts to endpoint', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.post<Map<String, dynamic>>('/notifications/n1/dismiss'),
    ).thenAnswer((_) async => _response({}, '/notifications/n1/dismiss'));

    await service.dismissNotification('n1');

    verify(
      () => dio.post<Map<String, dynamic>>('/notifications/n1/dismiss'),
    ).called(1);
  });

  test('preferences endpoints round trip', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    final prefs = UserNotificationPreferences(
      userId: 'u1',
      timezone: 'UTC',
      quietHours: QuietHours.defaultQuietHours,
      categories: const CategoryPreferences(
        social: true,
        news: false,
        marketing: true,
      ),
      updatedAt: DateTime.utc(2024, 1, 1),
    );

    when(
      () => dio.get<Map<String, dynamic>>('/notifications/preferences'),
    ).thenAnswer(
      (_) async => _response(prefs.toJson(), '/notifications/preferences'),
    );

    when(
      () => dio.put<Map<String, dynamic>>(
        '/notifications/preferences',
        data: any(named: 'data'),
      ),
    ).thenAnswer(
      (_) async => _response(prefs.toJson(), '/notifications/preferences'),
    );

    final fetched = await service.getPreferences();
    expect(fetched.userId, 'u1');

    final updated = await service.updatePreferences(prefs);
    expect(updated.categories.marketing, isTrue);
  });

  test('registerDevice returns payload', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.post<Map<String, dynamic>>(
        '/notifications/devices',
        data: any(named: 'data'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': true}, '/notifications/devices'),
    );

    final result = await service.registerDevice(
      deviceId: 'device-1',
      pushToken: 'token',
      platform: 'fcm',
      label: 'Pixel',
    );

    expect(result['success'], isTrue);
  });

  test('getDevices parses list', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/notifications/devices',
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {
          'devices': [
            {
              'id': 'd1',
              'userId': 'u1',
              'deviceId': 'device-1',
              'pushToken': 'token',
              'platform': 'android',
              'createdAt': '2024-01-01T00:00:00Z',
              'lastSeenAt': '2024-01-01T01:00:00Z',
            },
          ],
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/notifications/devices'),
      ),
    );

    final devices = await service.getDevices();
    expect(devices.length, 1);
    expect(devices.first.platform, 'android');
  });

  test('revokeDevice posts to endpoint', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.post<Map<String, dynamic>>('/notifications/devices/d1/revoke'),
    ).thenAnswer(
      (_) async => _response({}, '/notifications/devices/d1/revoke'),
    );

    await service.revokeDevice('d1');

    verify(
      () => dio.post<Map<String, dynamic>>('/notifications/devices/d1/revoke'),
    ).called(1);
  });

  test('getDevices throws on null response', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/notifications/devices',
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: null,
        statusCode: 200,
        requestOptions: RequestOptions(path: '/notifications/devices'),
      ),
    );

    await expectLater(service.getDevices(), throwsA(isA<Exception>()));
  });

  test('getUnreadCount surfaces default error message', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>('/notifications/unread-count'),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/notifications/unread-count'),
        response: Response(
          requestOptions: RequestOptions(path: '/notifications/unread-count'),
          statusCode: 500,
          data: {'message': 'fail'},
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      service.getUnreadCount(),
      throwsA(
        isA<Exception>().having(
          (error) => error.toString(),
          'message',
          contains('Failed to fetch unread count (HTTP 500)'),
        ),
      ),
    );
  });

  test('getNotifications surfaces error payload', () async {
    final dio = MockDio();
    final service = NotificationApiService(dioClient: dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/notifications'),
        response: Response(
          requestOptions: RequestOptions(path: '/notifications'),
          statusCode: 400,
          data: {'error': 'Bad request'},
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      service.getNotifications(),
      throwsA(
        isA<Exception>().having(
          (error) => error.toString(),
          'message',
          contains('Bad request'),
        ),
      ),
    );
  });
}

import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/services/push/device_token_service.dart';
import 'package:lythaus/services/push/push_notification_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

class MockSecureStorage extends Mock implements FlutterSecureStorage {}

class FakePushNotificationService implements PushNotificationService {
  FakePushNotificationService({this.token, this.platformValue = 'fcm'});

  final String? token;
  final String platformValue;

  @override
  String? get currentToken => token;

  @override
  String get platform => platformValue;

  @override
  Stream<Map<String, dynamic>> get onNotificationTapped => const Stream.empty();

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Future<void> initialize() async {}

  @override
  Future<void> subscribeToTopic(String topic) async {}

  @override
  Future<void> unsubscribeFromTopic(String topic) async {}

  @override
  void dispose() {}
}

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
  });

  test('registerDeviceToken throws when token missing', () async {
    final dio = MockDio();
    final storage = MockSecureStorage();
    final service = DeviceTokenService(
      dioClient: dio,
      pushService: FakePushNotificationService(token: null),
      storage: storage,
    );

    await expectLater(service.registerDeviceToken(), throwsA(isA<Exception>()));
  });

  test('registerDeviceToken posts and returns response data', () async {
    final dio = MockDio();
    final storage = MockSecureStorage();
    final service = DeviceTokenService(
      dioClient: dio,
      pushService: FakePushNotificationService(token: 'token'),
      storage: storage,
    );

    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => 'device-1');

    when(
      () => dio.post<Map<String, dynamic>>(
        '/notifications/devices',
        data: any(named: 'data'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'evictedDevice': {
          'id': 'd1',
          'userId': 'u1',
          'deviceId': 'device-1',
          'pushToken': 'token',
          'platform': 'android',
          'label': 'Pixel',
          'createdAt': '2024-01-01T00:00:00Z',
          'lastSeenAt': '2024-01-01T01:00:00Z',
        },
      }, '/notifications/devices'),
    );

    final result = await service.registerDeviceToken();

    expect(result['success'], isTrue);
    expect(result['evictedDevice'], isNotNull);
  });

  test('getRegisteredDevices parses response list', () async {
    final dio = MockDio();
    final storage = MockSecureStorage();
    final service = DeviceTokenService(
      dioClient: dio,
      pushService: FakePushNotificationService(token: 'token'),
      storage: storage,
    );

    when(
      () => dio.get<Map<String, dynamic>>('/notifications/devices'),
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

    final devices = await service.getRegisteredDevices();
    expect(devices.length, 1);
    expect(devices.first, isA<UserDeviceToken>());
  });

  test('revokeDevice posts to revoke endpoint', () async {
    final dio = MockDio();
    final storage = MockSecureStorage();
    final service = DeviceTokenService(
      dioClient: dio,
      pushService: FakePushNotificationService(token: 'token'),
      storage: storage,
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/notifications/devices/device-1/revoke',
      ),
    ).thenAnswer(
      (_) async => _response({}, '/notifications/devices/device-1/revoke'),
    );

    await service.revokeDevice('device-1');

    verify(
      () => dio.post<Map<String, dynamic>>(
        '/notifications/devices/device-1/revoke',
      ),
    ).called(1);
  });
}

import 'dart:async';

import 'package:lythaus/services/push/push_notification_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseMessaging extends Mock implements FirebaseMessaging {}

class MockFlutterLocalNotificationsPlugin extends Mock
    implements FlutterLocalNotificationsPlugin {}

NotificationSettings _settings() {
  return const NotificationSettings(
    authorizationStatus: AuthorizationStatus.authorized,
    alert: AppleNotificationSetting.notSupported,
    announcement: AppleNotificationSetting.notSupported,
    badge: AppleNotificationSetting.notSupported,
    carPlay: AppleNotificationSetting.notSupported,
    lockScreen: AppleNotificationSetting.notSupported,
    notificationCenter: AppleNotificationSetting.notSupported,
    showPreviews: AppleShowPreviewSetting.notSupported,
    timeSensitive: AppleNotificationSetting.notSupported,
    criticalAlert: AppleNotificationSetting.notSupported,
    sound: AppleNotificationSetting.notSupported,
    providesAppNotificationSettings: AppleNotificationSetting.notSupported,
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );
    registerFallbackValue(
      const NotificationDetails(
        android: AndroidNotificationDetails('test', 'test'),
        iOS: DarwinNotificationDetails(),
      ),
    );
  });

  test('initialize wires streams and emits deeplink events', () async {
    final messaging = MockFirebaseMessaging();
    final localNotifications = MockFlutterLocalNotificationsPlugin();
    final onMessageController = StreamController<RemoteMessage>();
    final onMessageOpenedController = StreamController<RemoteMessage>();
    final tokenRefreshController = StreamController<String>();

    void Function(NotificationResponse response)? responseCallback;

    when(() => messaging.getToken()).thenAnswer((_) async => 'token-1');
    when(
      () => messaging.requestPermission(
        alert: any(named: 'alert'),
        badge: any(named: 'badge'),
        sound: any(named: 'sound'),
        provisional: any(named: 'provisional'),
      ),
    ).thenAnswer((_) async => _settings());
    when(
      () => messaging.onTokenRefresh,
    ).thenAnswer((_) => tokenRefreshController.stream);
    when(() => messaging.getInitialMessage()).thenAnswer((_) async => null);

    when(
      () => localNotifications.initialize(
        any(),
        onDidReceiveNotificationResponse: any(
          named: 'onDidReceiveNotificationResponse',
        ),
      ),
    ).thenAnswer((invocation) async {
      responseCallback =
          invocation.namedArguments[#onDidReceiveNotificationResponse]
              as void Function(NotificationResponse)?;
      return true;
    });
    when(
      () => localNotifications.show(
        any(),
        any(),
        any(),
        any(),
        payload: any(named: 'payload'),
      ),
    ).thenAnswer((_) async {});

    final service = PushNotificationService(
      firebaseMessaging: messaging,
      localNotifications: localNotifications,
      onMessageStream: onMessageController.stream,
      onMessageOpenedAppStream: onMessageOpenedController.stream,
      getInitialMessage: () async => null,
      initializeTimeZones: () {},
    );

    final tapFuture = expectLater(
      service.onNotificationTapped,
      emitsInOrder([
        predicate<Map<String, dynamic>>(
          (data) => data['deeplink'] == 'lythaus://test',
        ),
        predicate<Map<String, dynamic>>(
          (data) => data['deeplink'] == 'lythaus://local',
        ),
      ]),
    );

    await service.initialize();

    onMessageOpenedController.add(
      const RemoteMessage(data: {'deeplink': 'lythaus://test'}),
    );

    onMessageController.add(
      const RemoteMessage(
        data: {'deeplink': 'lythaus://notice'},
        notification: RemoteNotification(title: 'Hello', body: 'World'),
      ),
    );
    await Future<void>.delayed(Duration.zero);

    verify(
      () => localNotifications.show(
        any(),
        'Hello',
        'World',
        any(),
        payload: 'lythaus://notice',
      ),
    ).called(1);

    final refreshFuture = expectLater(service.onTokenRefresh, emits('token-2'));
    tokenRefreshController.add('token-2');
    await refreshFuture;
    expect(service.currentToken, 'token-2');

    expect(responseCallback, isNotNull);
    responseCallback?.call(
      const NotificationResponse(
        notificationResponseType: NotificationResponseType.selectedNotification,
        payload: 'lythaus://local',
      ),
    );
    await tapFuture;

    service.dispose();
    await onMessageController.close();
    await onMessageOpenedController.close();
    await tokenRefreshController.close();
  });

  test('platform returns expected identifier', () {
    final service = PushNotificationService(
      firebaseMessaging: MockFirebaseMessaging(),
      localNotifications: MockFlutterLocalNotificationsPlugin(),
      onMessageStream: const Stream.empty(),
      onMessageOpenedAppStream: const Stream.empty(),
      getInitialMessage: () async => null,
      initializeTimeZones: () {},
      enableHandlers: false,
    );

    expect(service.platform, equals('fcm'));
  });
}

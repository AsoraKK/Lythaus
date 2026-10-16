// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tz;

/// Top-level handler for background messages (required to be top-level function)
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Initialize Firebase if needed (typically already done)
  // Process background notification - log, store, update badge, etc.
  debugPrint('[Push] Background message received: ${message.messageId}');
}

/// Service managing push notifications via Firebase Cloud Messaging (FCM) and
/// Apple Push Notification Service (APNS). Handles token registration,
/// foreground/background message processing, and deep-link routing.
class PushNotificationService {
  PushNotificationService({
    FirebaseMessaging? firebaseMessaging,
    FlutterLocalNotificationsPlugin? localNotifications,
    Stream<RemoteMessage>? onMessageStream,
    Stream<RemoteMessage>? onMessageOpenedAppStream,
    Future<RemoteMessage?> Function()? getInitialMessage,
    void Function()? initializeTimeZones,
    bool enableHandlers = true,
  }) : _firebaseMessaging = firebaseMessaging ?? FirebaseMessaging.instance,
       _localNotifications =
           localNotifications ?? FlutterLocalNotificationsPlugin(),
       _onMessageStream = onMessageStream ?? FirebaseMessaging.onMessage,
       _onMessageOpenedAppStream =
           onMessageOpenedAppStream ?? FirebaseMessaging.onMessageOpenedApp,
       _initializeTimeZones = initializeTimeZones ?? tz.initializeTimeZones,
       _enableHandlers = enableHandlers {
    _getInitialMessage =
        getInitialMessage ?? _firebaseMessaging.getInitialMessage;
  }

  final FirebaseMessaging _firebaseMessaging;
  final FlutterLocalNotificationsPlugin _localNotifications;
  final Stream<RemoteMessage> _onMessageStream;
  final Stream<RemoteMessage> _onMessageOpenedAppStream;
  late final Future<RemoteMessage?> Function() _getInitialMessage;
  final void Function() _initializeTimeZones;
  final bool _enableHandlers;

  // Stream controllers for handling notifications
  final _notificationTapController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _tokenRefreshController = StreamController<String>.broadcast();

  /// Stream of notification taps (deep-link routing)
  Stream<Map<String, dynamic>> get onNotificationTapped =>
      _notificationTapController.stream;

  /// Stream of FCM token refreshes
  Stream<String> get onTokenRefresh => _tokenRefreshController.stream;

  String? _currentToken;

  /// Initialize push notification service
  /// Call this once during app startup
  Future<void> initialize() async {
    // Initialize timezone database for scheduled notifications
    _initializeTimeZones();

    // Configure local notifications
    await _initializeLocalNotifications();

    // Request permission (iOS will prompt, Android auto-grants)
    await _requestPermission();

    // Get initial FCM token
    _currentToken = await _firebaseMessaging.getToken();
    debugPrint('[Push] FCM Token obtained');

    // Listen to token refresh events
    _firebaseMessaging.onTokenRefresh.listen((newToken) {
      _currentToken = newToken;
      _tokenRefreshController.add(newToken);
    });

    // Configure message handlers
    if (_enableHandlers) {
      _configureMessageHandlers();
    }
  }

  /// Get current FCM/APNS token
  String? get currentToken => _currentToken;

  /// Get platform identifier ('fcm' for Android, 'apns' for iOS)
  String get platform {
    if (kIsWeb) return 'web';
    return Platform.isIOS ? 'apns' : 'fcm';
  }

  Future<void> _initializeLocalNotifications() async {
    // Local notifications use platform channels not available on web.
    if (kIsWeb) return;

    const androidSettings = AndroidInitializationSettings(
      '@drawable/ic_launcher_monochrome',
    );
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false, // We handle permission separately
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    // Create Android notification channel for high-priority notifications
    if (!kIsWeb && Platform.isAndroid) {
      const androidChannel = AndroidNotificationChannel(
        'lythaus_notifications', // id
        'Lythaus Notifications', // title
        description: 'Notifications from Lythaus',
        importance: Importance.high,
        enableVibration: true,
      );

      await _localNotifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(androidChannel);
    }
  }

  Future<void> _requestPermission() async {
    final NotificationSettings settings = await _firebaseMessaging
        .requestPermission(
          alert: true,
          badge: true,
          sound: true,
          provisional: false,
        );

    debugPrint(
      '[Push] Notification permission status: ${settings.authorizationStatus}',
    );
  }

  void _configureMessageHandlers() {
    // Foreground messages - display local notification
    _onMessageStream.listen(_handleForegroundMessage);

    // Background message opened (app in background, user tapped notification)
    _onMessageOpenedAppStream.listen(_handleMessageOpenedApp);

    // Check if app was opened from terminated state via notification
    _getInitialMessage().then((message) {
      if (message != null) {
        _handleMessageOpenedApp(message);
      }
    });
  }

  void _handleForegroundMessage(RemoteMessage message) {
    debugPrint('[Push] Foreground message: ${message.messageId}');

    // Extract notification data
    final notification = message.notification;
    final data = message.data;

    if (notification != null) {
      // Display local notification for foreground messages
      _showLocalNotification(
        title: notification.title ?? 'Lythaus',
        body: notification.body ?? '',
        payload: data,
      );
    }
  }

  void _handleMessageOpenedApp(RemoteMessage message) {
    debugPrint('[Push] Message opened app: ${message.messageId}');

    // Extract deep-link and navigate
    final deeplink = message.data['deeplink'] as String?;
    if (deeplink != null) {
      _notificationTapController.add(message.data);
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    debugPrint('[Push] Local notification tapped');

    // Parse payload as JSON and emit for deep-link routing
    if (response.payload != null) {
      // Payload contains deep-link data
      _notificationTapController.add({'deeplink': response.payload});
    }
  }

  Future<void> _showLocalNotification({
    required String title,
    required String body,
    Map<String, dynamic>? payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'lythaus_notifications',
      'Lythaus Notifications',
      channelDescription: 'Notifications from Lythaus',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const notificationDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000, // notification id
      title,
      body,
      notificationDetails,
      payload: payload?['deeplink'] as String?, // Pass deep-link as payload
    );
  }

  /// Subscribe to a topic (for broadcast notifications)
  Future<void> subscribeToTopic(String topic) async {
    await _firebaseMessaging.subscribeToTopic(topic);
  }

  /// Unsubscribe from a topic
  Future<void> unsubscribeFromTopic(String topic) async {
    await _firebaseMessaging.unsubscribeFromTopic(topic);
  }

  /// Clean up resources
  void dispose() {
    _notificationTapController.close();
    _tokenRefreshController.close();
  }
}

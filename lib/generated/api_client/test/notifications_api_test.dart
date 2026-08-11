import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for NotificationsApi
void main() {
  final instance = LythausApiClient().getNotificationsApi();

  group(NotificationsApi, () {
    // Register or reactivate a push device
    //
    //Future<NotificationDeviceCreated> notificationsDevicesCreate(NotificationDeviceCreate notificationDeviceCreate) async
    test('test notificationsDevicesCreate', () async {
      // TODO
    });

    // List my push devices
    //
    //Future<NotificationDeviceList> notificationsDevicesList() async
    test('test notificationsDevicesList', () async {
      // TODO
    });

    // Revoke a push device
    //
    //Future<NotificationDeviceRevoked> notificationsDevicesRevoke(String id) async
    test('test notificationsDevicesRevoke', () async {
      // TODO
    });

    // Dismiss a notification
    //
    //Future<NotificationActionResponse> notificationsDismiss(String id, { String idempotencyKey }) async
    test('test notificationsDismiss', () async {
      // TODO
    });

    // List my notifications
    //
    //Future<NotificationPage> notificationsList({ String cursor, int limit }) async
    test('test notificationsList', () async {
      // TODO
    });

    // Get notification preferences
    //
    //Future<NotificationPreferences> notificationsPreferencesGet() async
    test('test notificationsPreferencesGet', () async {
      // TODO
    });

    // Replace notification preferences
    //
    //Future<NotificationPreferences> notificationsPreferencesReplace(NotificationPreferenceUpdate notificationPreferenceUpdate, { String idempotencyKey }) async
    test('test notificationsPreferencesReplace', () async {
      // TODO
    });

    // Partially update notification preferences
    //
    //Future<NotificationPreferences> notificationsPreferencesUpdate(NotificationPreferenceUpdate notificationPreferenceUpdate, { String idempotencyKey }) async
    test('test notificationsPreferencesUpdate', () async {
      // TODO
    });

    // Mark a notification read
    //
    //Future<NotificationActionResponse> notificationsRead(String id, { String idempotencyKey }) async
    test('test notificationsRead', () async {
      // TODO
    });

    // Get my unread notification count
    //
    //Future<NotificationUnreadCount> notificationsUnreadCount() async
    test('test notificationsUnreadCount', () async {
      // TODO
    });

  });
}

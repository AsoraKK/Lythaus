import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for NotificationsApi
void main() {
  final instance = LythausApiClient().getNotificationsApi();

  group(NotificationsApi, () {
    // Register a push device token
    //
    //Future<JsonObject> notificationsDevicesCreate(JsonObject body) async
    test('test notificationsDevicesCreate', () async {
      // TODO
    });

    // List registered push devices
    //
    //Future<JsonObject> notificationsDevicesList() async
    test('test notificationsDevicesList', () async {
      // TODO
    });

    // Revoke a push device registration
    //
    //Future<JsonObject> notificationsDevicesRevoke(String id, JsonObject body) async
    test('test notificationsDevicesRevoke', () async {
      // TODO
    });

    // Dismiss a notification
    //
    //Future<JsonObject> notificationsDismiss(String id, JsonObject body) async
    test('test notificationsDismiss', () async {
      // TODO
    });

    // List notifications for the current user
    //
    //Future<JsonObject> notificationsList() async
    test('test notificationsList', () async {
      // TODO
    });

    // Get notification preferences
    //
    //Future<JsonObject> notificationsPreferencesGet() async
    test('test notificationsPreferencesGet', () async {
      // TODO
    });

    // Update notification preferences
    //
    //Future<JsonObject> notificationsPreferencesUpdate(JsonObject body) async
    test('test notificationsPreferencesUpdate', () async {
      // TODO
    });

    // Mark a notification as read
    //
    //Future<JsonObject> notificationsRead(String id, JsonObject body) async
    test('test notificationsRead', () async {
      // TODO
    });

    // Send an admin-triggered notification
    //
    //Future<JsonObject> notificationsSend(JsonObject body) async
    test('test notificationsSend', () async {
      // TODO
    });

    // Get unread notification count
    //
    //Future<JsonObject> notificationsUnreadCount() async
    test('test notificationsUnreadCount', () async {
      // TODO
    });

  });
}

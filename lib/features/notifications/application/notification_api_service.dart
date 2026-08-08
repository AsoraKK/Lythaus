// ignore_for_file: public_member_api_docs

/// Notification API Service
///
/// HTTP client for notification-related REST endpoints.
/// Handles GET/POST to /notifications and /notifications/* endpoints.
library;

import 'package:dio/dio.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';

/// Response from GET /notifications
class NotificationsListResponse {
  final List<Notification> notifications;
  final String? continuationToken;
  final int totalUnread;

  const NotificationsListResponse({
    required this.notifications,
    this.continuationToken,
    required this.totalUnread,
  });

  factory NotificationsListResponse.fromJson(Map<String, dynamic> json) {
    return NotificationsListResponse(
      notifications: (json['notifications'] as List)
          .map((item) => Notification.fromJson(item as Map<String, dynamic>))
          .toList(),
      continuationToken: json['continuationToken'] as String?,
      totalUnread: (json['totalUnread'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Service for notification-related HTTP requests
class NotificationApiService {
  final Dio _dio;

  NotificationApiService({required Dio dioClient}) : _dio = dioClient;

  // ========================================================================
  // NOTIFICATIONS API
  // ========================================================================

  /// GET /notifications
  /// Fetch paginated notifications list
  Future<NotificationsListResponse> getNotifications({
    int limit = 20,
    String? continuationToken,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'limit': limit,
        if (continuationToken != null) 'continuationToken': continuationToken,
      };

      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: queryParams,
      );

      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notifications response');
      }
      return NotificationsListResponse.fromJson(data);
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to fetch notifications');
    }
  }

  /// GET /notifications/unread-count
  /// Get unread badge count
  Future<int> getUnreadCount() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications/unread-count',
      );
      return (response.data?['unreadCount'] as num?)?.toInt() ??
          (response.data?['count'] as num?)?.toInt() ??
          0;
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to fetch unread count');
    }
  }

  /// POST /notifications/:id/read
  /// Mark a single notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/notifications/$notificationId/read',
      );
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to mark notification as read');
    }
  }

  /// POST /notifications/:id/dismiss
  /// Dismiss a notification (remove from list)
  Future<void> dismissNotification(String notificationId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/notifications/$notificationId/dismiss',
      );
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to dismiss notification');
    }
  }

  // ========================================================================
  // PREFERENCES API
  // ========================================================================

  /// GET /notifications/preferences
  /// Fetch user notification preferences
  Future<UserNotificationPreferences> getPreferences() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications/preferences',
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notification preferences response');
      }
      return UserNotificationPreferences.fromJson(data);
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to fetch notification preferences');
    }
  }

  /// PUT /notifications/preferences
  /// Update user notification preferences
  Future<UserNotificationPreferences> updatePreferences(
    UserNotificationPreferences preferences,
  ) async {
    try {
      final response = await _dio.put<Map<String, dynamic>>(
        '/notifications/preferences',
        data: preferences.toJson(),
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notification preferences response');
      }
      return UserNotificationPreferences.fromJson(data);
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to update notification preferences');
    }
  }

  // ========================================================================
  // DEVICES API
  // ========================================================================

  /// POST /notifications/devices
  /// Register a push token (enforces 3-device cap)
  /// Returns {"device": {...}, "evictedDevice": {...}?}
  Future<Map<String, dynamic>> registerDevice({
    required String deviceId,
    required String pushToken,
    required String platform,
    required String label,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/notifications/devices',
        data: {
          'deviceId': deviceId,
          'pushToken': pushToken,
          'platform': platform,
          'label': label,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to register device');
    }
  }

  /// GET /notifications/devices
  /// Fetch list of registered devices
  Future<List<UserDeviceToken>> getDevices({bool activeOnly = true}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications/devices',
        queryParameters: {'activeOnly': activeOnly},
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid devices response');
      }
      final devices = data['devices'];
      if (devices is! List) {
        throw Exception('Invalid devices response');
      }
      return devices
          .whereType<Map<String, dynamic>>()
          .map(
            (item) => UserDeviceToken.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList();
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to fetch devices');
    }
  }

  /// POST /notifications/devices/:id/revoke
  /// Revoke (soft-delete) a device token
  Future<void> revokeDevice(String deviceId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/notifications/devices/$deviceId/revoke',
      );
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to revoke device');
    }
  }

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  Exception _handleError(DioException error, String defaultMessage) {
    if (error.response != null) {
      final data = error.response!.data;
      if (data is Map && data.containsKey('error')) {
        return Exception(data['error'] as String);
      }
      return Exception('$defaultMessage (HTTP ${error.response!.statusCode})');
    }
    return Exception('$defaultMessage: ${error.message}');
  }
}

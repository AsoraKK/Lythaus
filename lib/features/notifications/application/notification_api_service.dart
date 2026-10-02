// ignore_for_file: public_member_api_docs

/// Notification API Service
///
/// HTTP client for notification-related REST endpoints.
/// Handles GET/POST to /notifications and /notifications/* endpoints.
library;

import 'package:dio/dio.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';

class NotificationServiceUnavailable implements Exception {
  const NotificationServiceUnavailable();

  @override
  String toString() => 'This notification service is not available.';
}

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

  factory NotificationsListResponse.fromJson(
    Map<String, dynamic> json, {
    String? ownerId,
  }) {
    return NotificationsListResponse(
      notifications: ((json['items'] ?? json['notifications']) as List)
          .map(
            (item) => Notification.fromJson(
              item as Map<String, dynamic>,
              ownerId: ownerId,
            ),
          )
          .toList(),
      continuationToken:
          (json['nextCursor'] ?? json['continuationToken']) as String?,
      totalUnread: (json['totalUnread'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Service for notification-related HTTP requests
class NotificationApiService {
  final Dio _dio;
  final String? ownerId;
  final Future<String?> Function()? _accessToken;
  final CancelToken? _cancelToken;

  NotificationApiService({
    required Dio dioClient,
    this.ownerId,
    Future<String?> Function()? accessToken,
    CancelToken? cancelToken,
  }) : _dio = dioClient,
       _accessToken = accessToken,
       _cancelToken = cancelToken;

  Future<Options?> _options() async {
    if (_cancelToken?.isCancelled == true) throw _cancelToken!.cancelError!;
    if (_accessToken == null) return null;
    if (ownerId == null) throw const AuthRequiredException();
    final token = _cancelToken == null
        ? await _accessToken()
        : await Future.any<String?>([
            _accessToken(),
            _cancelToken.whenCancel.then<String?>((error) => throw error),
          ]);
    if (_cancelToken?.isCancelled == true) throw _cancelToken!.cancelError!;
    if (token == null || token.isEmpty) throw const AuthRequiredException();
    return Options(headers: {'Authorization': 'Bearer $token'});
  }

  void _requireOwner(String responseOwner) {
    if (ownerId != null && responseOwner != ownerId) {
      throw const FormatException(
        'Notification response does not match the session',
      );
    }
  }

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
        if (continuationToken != null) 'cursor': continuationToken,
      };

      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: queryParams,
        options: await _options(),
        cancelToken: _cancelToken,
      );

      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notifications response');
      }
      final result = NotificationsListResponse.fromJson(data, ownerId: ownerId);
      for (final notification in result.notifications) {
        _requireOwner(notification.userId);
      }
      return result;
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
        options: await _options(),
        cancelToken: _cancelToken,
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
        options: await _options(),
        cancelToken: _cancelToken,
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
        options: await _options(),
        cancelToken: _cancelToken,
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
        options: await _options(),
        cancelToken: _cancelToken,
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notification preferences response');
      }
      final preferences = UserNotificationPreferences.fromJson(
        data,
        ownerId: ownerId,
      );
      _requireOwner(preferences.userId);
      return preferences;
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
      _requireOwner(preferences.userId);
      final response = await _dio.put<Map<String, dynamic>>(
        '/notifications/preferences',
        data: preferences.toJson(),
        options: await _options(),
        cancelToken: _cancelToken,
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid notification preferences response');
      }
      final saved = UserNotificationPreferences.fromJson(
        data,
        ownerId: ownerId,
      );
      _requireOwner(saved.userId);
      return saved;
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
        options: await _options(),
        cancelToken: _cancelToken,
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
        options: await _options(),
        cancelToken: _cancelToken,
      );
      final data = response.data;
      if (data == null) {
        throw Exception('Invalid devices response');
      }
      final devices = data['items'] ?? data['devices'];
      if (devices is! List) {
        throw Exception('Invalid devices response');
      }
      final parsed = devices
          .whereType<Map<String, dynamic>>()
          .map(
            (item) => UserDeviceToken.fromJson(
              Map<String, dynamic>.from(item),
              ownerId: ownerId,
            ),
          )
          .toList();
      for (final device in parsed) {
        _requireOwner(device.userId);
      }
      return activeOnly
          ? parsed.where((device) => device.isActive).toList()
          : parsed;
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
        options: await _options(),
        cancelToken: _cancelToken,
      );
    } on DioException catch (e) {
      throw _handleError(e, 'Failed to revoke device');
    }
  }

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  Exception _handleError(DioException error, String defaultMessage) {
    if (CancelToken.isCancel(error)) return error;
    if (error.response?.statusCode == 401) return const AuthRequiredException();
    if (error.response != null) {
      final data = error.response!.data;
      if (error.response!.statusCode == 404) {
        return const NotificationServiceUnavailable();
      }
      if (data is Map && data['error'] is String) {
        return Exception(data['error'] as String);
      }
      return Exception('$defaultMessage (HTTP ${error.response!.statusCode})');
    }
    return Exception('$defaultMessage: ${error.message}');
  }
}

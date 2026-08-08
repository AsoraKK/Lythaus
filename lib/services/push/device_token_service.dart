// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/services/push/push_notification_service.dart';

/// Service for registering and managing device tokens with backend
class DeviceTokenService {
  static const String _deviceIdStorageKey = 'push_device_id_v1';
  static const Uuid _uuid = Uuid();

  final Dio _dio;
  final PushNotificationService _pushService;
  final FlutterSecureStorage _storage;

  DeviceTokenService({
    required Dio dioClient,
    required PushNotificationService pushService,
    required FlutterSecureStorage storage,
  }) : _dio = dioClient,
       _pushService = pushService,
       _storage = storage;

  /// Register current device token with backend
  /// Should be called on app launch and whenever token refreshes
  ///
  /// Returns a map with:
  /// - `success`: true if registered
  /// - `evictedDevice`: UserDeviceToken if another device was removed (3-device cap)
  Future<Map<String, dynamic>> registerDeviceToken({String? label}) async {
    final token = _pushService.currentToken;
    if (token == null) {
      throw Exception('No FCM/APNS token available');
    }

    final platform = _pushService.platform;
    final deviceId = await _getOrCreateDeviceId();

    // Generate device label if not provided
    final deviceLabel = label ?? _generateDeviceLabel();

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/notifications/devices',
        data: {
          'deviceId': deviceId,
          'pushToken': token,
          'platform': platform,
          'label': deviceLabel,
        },
      );

      debugPrint('[DeviceToken] Device token registered successfully');

      if (response.data?['evictedDevice'] != null) {
        final evicted = UserDeviceToken.fromJson(
          response.data!['evictedDevice'] as Map<String, dynamic>,
        );
        debugPrint(
          '[DeviceToken] Another device was removed due to 3-device cap: ${evicted.label}',
        );
      }

      return response.data as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[DeviceToken] Failed to register device token: $e');
      rethrow;
    }
  }

  /// Get list of registered devices for current user
  Future<List<UserDeviceToken>> getRegisteredDevices() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications/devices',
      );
      final payload = response.data?['devices'];
      if (payload is! List) {
        throw Exception('Invalid devices response');
      }
      final devices = payload
          .whereType<Map<String, dynamic>>()
          .map((json) => UserDeviceToken.fromJson(json))
          .toList();
      return devices;
    } catch (e) {
      debugPrint('[DeviceToken] Failed to fetch registered devices: $e');
      rethrow;
    }
  }

  /// Revoke a device token (user manually removes device)
  Future<void> revokeDevice(String deviceId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/notifications/devices/$deviceId/revoke',
      );
      debugPrint('[DeviceToken] Device revoked successfully');
    } catch (e) {
      debugPrint('[DeviceToken] Failed to revoke device: $e');
      rethrow;
    }
  }

  Future<String> _getOrCreateDeviceId() async {
    final existing = await _storage.read(key: _deviceIdStorageKey);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final generated = _uuid.v4();
    await _storage.write(key: _deviceIdStorageKey, value: generated);
    return generated;
  }

  String _generateDeviceLabel() {
    // TODO: Get actual device info using device_info_plus package
    // For now, use platform + timestamp
    final platform = _pushService.platform == 'apns' ? 'iPhone' : 'Android';
    return '$platform Device';
  }
}

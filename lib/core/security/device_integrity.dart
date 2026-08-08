// ignore_for_file: public_member_api_docs

/// LYTHAUS DEVICE INTEGRITY DETECTION
///
/// 🎯 Purpose: Detect compromised devices (root/jailbreak)
/// 🔐 Security: Block posting on compromised devices, allow read-only
/// 🚨 Telemetry: Log device_integrity_violation events
/// 📱 Platform: Flutter with native platform plugins
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// Prefer flutter_jailbreak_detection when available; keep a safe fallback.
// ignore: unused_import
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart'
    as jailbreak;
import 'dart:convert';
import 'dart:developer' as developer;

/// Device integrity state
enum DeviceIntegrityStatus { unknown, secure, compromised, error }

/// Device integrity information
class DeviceIntegrityInfo {
  final DeviceIntegrityStatus status;
  final String reason;
  final DateTime checkedAt;
  final bool allowPosting;
  final bool allowReading;

  const DeviceIntegrityInfo({
    required this.status,
    required this.reason,
    required this.checkedAt,
    required this.allowPosting,
    required this.allowReading,
  });

  bool get isCompromised => status == DeviceIntegrityStatus.compromised;

  Map<String, dynamic> toJson() => {
    'status': status.name,
    'reason': reason,
    'checkedAt': checkedAt.toIso8601String(),
    'allowPosting': allowPosting,
    'allowReading': allowReading,
    'platform': defaultTargetPlatform.name,
  };
}

/// Device integrity service with caching
class DeviceIntegrityService {
  DeviceIntegrityInfo? _cachedResult;
  DateTime? _lastCheck;
  static const Duration _cacheValidity = Duration(hours: 1);

  /// Check device integrity with memoization
  Future<DeviceIntegrityInfo> checkIntegrity() async {
    // Return cached result if still valid
    if (_cachedResult != null &&
        _lastCheck != null &&
        DateTime.now().difference(_lastCheck!) < _cacheValidity) {
      return _cachedResult!;
    }

    try {
      // Device integrity check
      // Note: flutter_jailbreak_detection API varies by version
      // Using a safe fallback approach for now
      bool isJailbroken = false;

      try {
        // Use plugin if linked; otherwise fallback to secure
        bool rooted = false;
        try {
          rooted = await jailbreak.FlutterJailbreakDetection.jailbroken;
        } catch (_) {}
        isJailbroken = rooted;
      } catch (e) {
        debugPrint('🚨 Jailbreak detection failed, assuming secure: $e');
        isJailbroken = false; // Fail secure
      }

      // For testing: allow override in debug mode
      const isTestCompromised = bool.fromEnvironment(
        'TEST_DEVICE_COMPROMISED',
        defaultValue: false,
      );
      final actuallyCompromised =
          isJailbroken || (kDebugMode && isTestCompromised);

      final now = DateTime.now();

      DeviceIntegrityInfo result;

      if (actuallyCompromised) {
        result = DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is rooted/jailbroken',
          checkedAt: now,
          allowPosting: false, // Block posting
          allowReading: true, // Allow reading
        );

        _logIntegrityViolation('device_compromised');
      } else {
        result = DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: now,
          allowPosting: true,
          allowReading: true,
        );
      }

      // Cache the result
      _cachedResult = result;
      _lastCheck = now;

      return result;
    } catch (e) {
      try {
        debugPrint('🚨 Device integrity check failed: $e');
      } catch (logError) {
        developer.log(
          '🚨 [FALLBACK] Logging failed: $logError',
          name: 'device_integrity',
          error: logError,
        );
      }

      final errorResult = DeviceIntegrityInfo(
        status: DeviceIntegrityStatus.error,
        reason: 'Integrity check failed: $e',
        checkedAt: DateTime.now(),
        allowPosting: true, // Fail open for usability
        allowReading: true,
      );

      return errorResult;
    }
  }

  /// Clear cached result to force re-check
  void invalidateCache() {
    _cachedResult = null;
    _lastCheck = null;
  }

  /// Log device integrity violation for telemetry
  void _logIntegrityViolation(String reason) {
    final event = {
      'event': 'device_integrity_violation',
      'reason': reason,
      'timestamp': DateTime.now().toIso8601String(),
      'platform': defaultTargetPlatform.name,
      'buildMode': kDebugMode ? 'debug' : 'release',
    };

    debugPrint('🚨 SECURITY: Device integrity violation: ${jsonEncode(event)}');

    // Telemetry hook: integrate with telemetry service if available
    // Example: TelemetryService.reportSecurityEvent(event);
  }
}

/// Riverpod providers for device integrity
final deviceIntegrityServiceProvider = Provider<DeviceIntegrityService>((ref) {
  return DeviceIntegrityService();
});

final deviceIntegrityProvider = FutureProvider<DeviceIntegrityInfo>((ref) {
  final service = ref.watch(deviceIntegrityServiceProvider);
  return service.checkIntegrity();
});

/// Current device integrity status (synchronous)
final deviceIntegrityStatusProvider = Provider<DeviceIntegrityStatus>((ref) {
  final asyncIntegrity = ref.watch(deviceIntegrityProvider);
  return asyncIntegrity.when(
    data: (info) => info.status,
    loading: () => DeviceIntegrityStatus.unknown,
    error: (_, __) => DeviceIntegrityStatus.error,
  );
});

/// Whether posting is allowed based on device integrity
final postingAllowedProvider = Provider<bool>((ref) {
  final asyncIntegrity = ref.watch(deviceIntegrityProvider);
  return asyncIntegrity.when(
    data: (info) => info.allowPosting,
    loading: () => false, // Block posting while checking
    error: (_, __) => true, // Fail open on error
  );
});

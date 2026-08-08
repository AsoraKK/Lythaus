// ignore_for_file: public_member_api_docs

/// LYTHAUS DEVICE SECURITY SERVICE (Enhanced)
///
/// 🎯 Purpose: Detect compromised devices (root/jailbreak/emulator)
/// 🔐 Security: Heuristic-based detection with telemetry
/// 📱 Platform: Flutter with native platform checks
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart'
    as jailbreak;
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/security_telemetry.dart';

/// Device security state
class DeviceSecurityState {
  final bool isRootedOrJailbroken;
  final bool isEmulator;
  final bool isDebugBuild;
  final DateTime lastCheckedAt;

  const DeviceSecurityState({
    required this.isRootedOrJailbroken,
    required this.isEmulator,
    required this.isDebugBuild,
    required this.lastCheckedAt,
  });

  // Consider device compromised if it's rooted/jailbroken OR an emulator.
  // Tests treat emulators as compromised; production policy may treat emulator
  // differently per environment (handled in the integrity guard).
  bool get isCompromised => isRootedOrJailbroken || isEmulator;

  Map<String, dynamic> toJson() => {
    'isRootedOrJailbroken': isRootedOrJailbroken,
    'isEmulator': isEmulator,
    'isDebugBuild': isDebugBuild,
    'lastCheckedAt': lastCheckedAt.toIso8601String(),
    'platform': defaultTargetPlatform.name,
  };
}

/// Device security service interface
abstract class DeviceSecurityService {
  Future<DeviceSecurityState> evaluateSecurity();
  void clearCache();
}

/// Implementation of device security checks
class DeviceSecurityServiceImpl implements DeviceSecurityService {
  final Environment _environment;
  DeviceSecurityState? _cachedState;
  DateTime? _lastCheck;
  static const Duration _cacheValidity = Duration(hours: 1);

  DeviceSecurityServiceImpl(this._environment);

  @override
  Future<DeviceSecurityState> evaluateSecurity() async {
    // Web has no meaningful device integrity checks — always report secure.
    if (kIsWeb) {
      final webState = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: kDebugMode,
        lastCheckedAt: DateTime.now(),
      );
      _cachedState = webState;
      _lastCheck = DateTime.now();
      return webState;
    }

    // Return cached result if still valid
    if (_cachedState != null &&
        _lastCheck != null &&
        DateTime.now().difference(_lastCheck!) < _cacheValidity) {
      return _cachedState!;
    }

    final now = DateTime.now();

    try {
      // Check for jailbreak/root
      bool isJailbroken = false;
      bool isDevelopmentMode = false;

      try {
        isJailbroken = await jailbreak.FlutterJailbreakDetection.jailbroken;
        isDevelopmentMode =
            await jailbreak.FlutterJailbreakDetection.developerMode;
      } catch (e) {
        debugPrint('⚠️  Jailbreak detection unavailable, assuming secure: $e');
      }

      // Check for emulator/simulator
      bool isEmulator = false;
      try {
        // Platform-specific emulator detection would go here
        // For now, rely on kDebugMode as a proxy
        isEmulator = kDebugMode && !kReleaseMode;
      } catch (e) {
        debugPrint('⚠️  Emulator detection unavailable: $e');
      }

      // Allow override in debug builds for testing
      const testCompromised = bool.fromEnvironment(
        'TEST_DEVICE_COMPROMISED',
        defaultValue: false,
      );

      final actuallyCompromised =
          isJailbroken || isDevelopmentMode || (kDebugMode && testCompromised);

      final state = DeviceSecurityState(
        isRootedOrJailbroken: actuallyCompromised,
        isEmulator: isEmulator,
        isDebugBuild: kDebugMode,
        lastCheckedAt: now,
      );

      // Log device state evaluation
      final event = SecurityEvent.deviceIntegrity(
        result: actuallyCompromised ? 'device_compromised' : 'device_secure',
        environment: _environment,
        reason: actuallyCompromised
            ? 'rooted_or_jailbroken'
            : 'integrity_verified',
        metadata: state.toJson(),
      );
      SecurityTelemetry.logEvent(event);

      // Cache the result
      _cachedState = state;
      _lastCheck = now;

      return state;
    } catch (e) {
      debugPrint('🚨 Device security evaluation failed: $e');

      // Fail open: assume secure to avoid blocking users
      final errorState = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: kDebugMode,
        lastCheckedAt: now,
      );

      final event = SecurityEvent.deviceIntegrity(
        result: 'evaluation_error',
        environment: _environment,
        reason: 'check_failed',
        metadata: {'error': e.toString()},
      );
      SecurityTelemetry.logEvent(event);

      return errorState;
    }
  }

  @override
  void clearCache() {
    _cachedState = null;
    _lastCheck = null;
  }
}

/// Riverpod providers for device security
final deviceSecurityServiceProvider = Provider<DeviceSecurityService>((ref) {
  final config = EnvironmentConfig.fromEnvironment();
  return DeviceSecurityServiceImpl(config.environment);
});

final deviceSecurityStateProvider = FutureProvider<DeviceSecurityState>((ref) {
  final service = ref.watch(deviceSecurityServiceProvider);
  return service.evaluateSecurity();
});

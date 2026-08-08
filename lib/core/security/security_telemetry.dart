// ignore_for_file: public_member_api_docs

/// LYTHAUS SECURITY TELEMETRY
///
/// 🎯 Purpose: Structured logging for security events
/// 🚨 Monitoring: Emits security decisions without PII
/// 📊 Observability: Integrates with telemetry pipeline
library;

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:lythaus/core/config/environment_config.dart';

/// Security event types
enum SecurityEventType {
  tlsPinning,
  deviceIntegrity,
  integrityGuard,
  securityOverride,
}

/// Structured security event
class SecurityEvent {
  final SecurityEventType type;
  final String result; // e.g., 'pin_match', 'blocked', 'allowed_with_warning'
  final Environment? environment;
  final String? host;
  final bool? strictMode;
  final String? useCase;
  final String? reason;
  final Map<String, dynamic>? metadata;
  final DateTime timestamp;

  SecurityEvent._({
    required this.type,
    required this.result,
    this.environment,
    this.host,
    this.strictMode,
    this.useCase,
    this.reason,
    this.metadata,
  }) : timestamp = DateTime.now();

  factory SecurityEvent.tlsPinning({
    required String host,
    required String environment,
    required String result,
    required bool strictMode,
    Map<String, dynamic>? metadata,
  }) {
    return SecurityEvent._(
      type: SecurityEventType.tlsPinning,
      host: host,
      result: result,
      strictMode: strictMode,
      metadata: {...?metadata, 'environment': environment},
    );
  }

  factory SecurityEvent.deviceIntegrity({
    required String result,
    required Environment environment,
    String? reason,
    Map<String, dynamic>? metadata,
  }) {
    return SecurityEvent._(
      type: SecurityEventType.deviceIntegrity,
      result: result,
      environment: environment,
      reason: reason,
      metadata: metadata,
    );
  }

  factory SecurityEvent.integrityGuard({
    required String result,
    required Environment environment,
    required String useCase,
    String? reason,
    bool? strictMode,
    Map<String, dynamic>? metadata,
  }) {
    return SecurityEvent._(
      type: SecurityEventType.integrityGuard,
      result: result,
      environment: environment,
      useCase: useCase,
      reason: reason,
      strictMode: strictMode,
      metadata: metadata,
    );
  }

  factory SecurityEvent.securityOverride({
    required String result,
    required Environment environment,
    required String reason,
    Map<String, dynamic>? metadata,
  }) {
    return SecurityEvent._(
      type: SecurityEventType.securityOverride,
      result: result,
      environment: environment,
      reason: reason,
      metadata: metadata,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'event_type': type.name,
      'result': result,
      if (environment != null) 'environment': environment!.name,
      if (host != null) 'host': host,
      if (strictMode != null) 'strict_mode': strictMode,
      if (useCase != null) 'use_case': useCase,
      if (reason != null) 'reason': reason,
      if (metadata != null) ...metadata!,
      'timestamp': timestamp.toIso8601String(),
      'platform': defaultTargetPlatform.name,
      // Never log PII: no user IDs, emails, device identifiers
    };
  }
}

/// Security telemetry logger
class SecurityTelemetry {
  /// Log a security event
  static void logEvent(SecurityEvent event) {
    // Always log to debug console
    final json = event.toJson();
    debugPrint('🔐 SECURITY: ${jsonEncode(json)}');

    // In production, route to central telemetry pipeline
    // Example integration points:
    // - Firebase Analytics
    // - Cloudflare observability
    // - Custom telemetry service
    //
    // if (kReleaseMode) {
    //   TelemetryService.reportSecurityEvent(json);
    // }
  }

  /// Log security configuration snapshot
  static void logConfigSnapshot(EnvironmentConfig config) {
    final snapshot = {
      'event_type': 'security_config_snapshot',
      'environment': config.environment.name,
      'tls_pinning_enabled': config.security.tlsPins.enabled,
      'tls_pinning_strict': config.security.tlsPins.strictMode,
      'tls_pin_count': config.security.tlsPins.spkiPinsBase64.length,
      'strict_device_integrity': config.security.strictDeviceIntegrity,
      'block_rooted_devices': config.security.blockRootedDevices,
      'timestamp': DateTime.now().toIso8601String(),
      'platform': defaultTargetPlatform.name,
    };

    debugPrint('🔐 SECURITY CONFIG: ${jsonEncode(snapshot)}');
  }
}

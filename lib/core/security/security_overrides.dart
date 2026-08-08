// ignore_for_file: public_member_api_docs

/// LYTHAUS SECURITY OVERRIDES
///
/// 🎯 Purpose: Break-glass mechanism for emergency security relaxation
/// ⚠️  WARNING: Use only for legitimate QA/support scenarios
/// 📋 Audit: All overrides are logged to security telemetry
library;

import 'package:flutter/foundation.dart';

/// Security override configuration
@immutable
class SecurityOverrideConfig {
  /// Relax TLS pinning (allow cert mismatches)
  final bool relaxTlsPinning;

  /// Relax device integrity (allow rooted/jailbroken devices)
  final bool relaxDeviceIntegrity;

  /// Reason for override (required for audit trail)
  final String? overrideReason;

  /// Timestamp when override was activated
  final DateTime? activatedAt;

  /// Override expiry (defaults to 24 hours from activation)
  final Duration? validityDuration;

  const SecurityOverrideConfig({
    this.relaxTlsPinning = false,
    this.relaxDeviceIntegrity = false,
    this.overrideReason,
    this.activatedAt,
    this.validityDuration,
  });

  /// Create override for QA testing
  factory SecurityOverrideConfig.forQa({
    required String reason,
    bool relaxTlsPinning = false,
    bool relaxDeviceIntegrity = false,
    Duration? validFor,
  }) {
    return SecurityOverrideConfig(
      relaxTlsPinning: relaxTlsPinning,
      relaxDeviceIntegrity: relaxDeviceIntegrity,
      overrideReason: 'QA: $reason',
      activatedAt: DateTime.now(),
      validityDuration: validFor ?? const Duration(hours: 24),
    );
  }

  /// Create override for support scenarios
  factory SecurityOverrideConfig.forSupport({
    required String ticketId,
    bool relaxTlsPinning = false,
    bool relaxDeviceIntegrity = false,
  }) {
    return SecurityOverrideConfig(
      relaxTlsPinning: relaxTlsPinning,
      relaxDeviceIntegrity: relaxDeviceIntegrity,
      overrideReason: 'Support ticket: $ticketId',
      activatedAt: DateTime.now(),
      validityDuration: const Duration(hours: 48),
    );
  }

  /// No overrides (secure defaults)
  factory SecurityOverrideConfig.none() {
    return const SecurityOverrideConfig();
  }

  /// Check if override is still valid (not expired)
  bool isValid() {
    if (activatedAt == null || validityDuration == null) {
      return false;
    }
    final expiresAt = activatedAt!.add(validityDuration!);
    return DateTime.now().isBefore(expiresAt);
  }

  /// Check if any overrides are active
  bool get hasAnyOverride => relaxTlsPinning || relaxDeviceIntegrity;

  /// Get time remaining until expiry
  Duration? get timeRemaining {
    if (!isValid()) return null;
    final expiresAt = activatedAt!.add(validityDuration!);
    return expiresAt.difference(DateTime.now());
  }

  SecurityOverrideConfig copyWith({
    bool? relaxTlsPinning,
    bool? relaxDeviceIntegrity,
    String? overrideReason,
    DateTime? activatedAt,
    Duration? validityDuration,
  }) {
    return SecurityOverrideConfig(
      relaxTlsPinning: relaxTlsPinning ?? this.relaxTlsPinning,
      relaxDeviceIntegrity: relaxDeviceIntegrity ?? this.relaxDeviceIntegrity,
      overrideReason: overrideReason ?? this.overrideReason,
      activatedAt: activatedAt ?? this.activatedAt,
      validityDuration: validityDuration ?? this.validityDuration,
    );
  }

  Map<String, dynamic> toJson() => {
    'relaxTlsPinning': relaxTlsPinning,
    'relaxDeviceIntegrity': relaxDeviceIntegrity,
    'overrideReason': overrideReason,
    'activatedAt': activatedAt?.toIso8601String(),
    'validityDuration': validityDuration?.inSeconds,
    'isValid': isValid(),
    'timeRemaining': timeRemaining?.inSeconds,
  };
}

/// Global security overrides provider
///
/// ⚠️  WARNING: This is a singleton for convenience. In production,
/// consider using dependency injection or state management.
class SecurityOverridesProvider {
  static SecurityOverrideConfig _current = const SecurityOverrideConfig();

  /// Get current override configuration
  static SecurityOverrideConfig get current => _current;

  /// Set override configuration (with validation)
  static void set(SecurityOverrideConfig config) {
    if (kReleaseMode && config.hasAnyOverride) {
      throw StateError(
        'Security overrides cannot be set in release builds. '
        'This is a safety mechanism to prevent production misuse.',
      );
    }

    if (config.hasAnyOverride && config.overrideReason == null) {
      throw ArgumentError(
        'Override reason is required when activating security overrides. '
        'This ensures proper audit trail.',
      );
    }

    _current = config;
  }

  /// Clear all overrides
  static void clear() {
    _current = const SecurityOverrideConfig();
  }

  /// Check if any overrides are active and valid
  static bool get hasActiveOverrides =>
      _current.hasAnyOverride && _current.isValid();
}

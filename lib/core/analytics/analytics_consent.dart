// ignore_for_file: public_member_api_docs

/// LYTHAUS ANALYTICS CONSENT MODEL
///
/// 🎯 Purpose: User consent tracking for analytics
/// 🔐 Privacy: Default opt-out, explicit opt-in required
/// 📋 Compliance: GDPR/POPIA compatible consent management
library;

import 'package:meta/meta.dart';

/// Source of consent decision (for audit trail)
enum ConsentSource {
  /// Consent state unknown (initial state)
  unknown,

  /// Consent granted/revoked during onboarding flow
  onboarding,

  /// Consent granted/revoked via privacy settings screen
  privacySettings,

  /// Consent migrated from previous version
  migration,
}

/// Analytics consent state.
///
/// Immutable model tracking user's explicit consent to share
/// anonymous usage data for product improvement.
@immutable
class AnalyticsConsent {
  const AnalyticsConsent({
    required this.enabled,
    required this.updatedAt,
    required this.source,
    this.policyVersion = 1,
  });

  /// Whether user has consented to analytics.
  ///
  /// Default: false (opt-out by default per GDPR/POPIA)
  final bool enabled;

  /// When consent was last updated
  final DateTime updatedAt;

  /// Where consent was granted/revoked
  final ConsentSource source;

  /// Privacy policy version at time of consent
  ///
  /// Allows re-prompting if policy materially changes.
  /// Current version: 1
  final int policyVersion;

  /// Create default consent state (disabled)
  factory AnalyticsConsent.defaultConsent() {
    return AnalyticsConsent(
      enabled: false,
      updatedAt: DateTime.now(),
      source: ConsentSource.unknown,
      policyVersion: 1,
    );
  }

  /// Create consent from JSON storage
  factory AnalyticsConsent.fromJson(Map<String, dynamic> json) {
    return AnalyticsConsent(
      enabled: json['enabled'] as bool? ?? false,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      source: ConsentSource.values.firstWhere(
        (s) => s.name == json['source'],
        orElse: () => ConsentSource.unknown,
      ),
      policyVersion: json['policyVersion'] as int? ?? 1,
    );
  }

  /// Convert to JSON for storage
  Map<String, dynamic> toJson() {
    return {
      'enabled': enabled,
      'updatedAt': updatedAt.toIso8601String(),
      'source': source.name,
      'policyVersion': policyVersion,
    };
  }

  /// Create copy with updated fields
  AnalyticsConsent copyWith({
    bool? enabled,
    DateTime? updatedAt,
    ConsentSource? source,
    int? policyVersion,
  }) {
    return AnalyticsConsent(
      enabled: enabled ?? this.enabled,
      updatedAt: updatedAt ?? this.updatedAt,
      source: source ?? this.source,
      policyVersion: policyVersion ?? this.policyVersion,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AnalyticsConsent &&
          runtimeType == other.runtimeType &&
          enabled == other.enabled &&
          updatedAt == other.updatedAt &&
          source == other.source &&
          policyVersion == other.policyVersion;

  @override
  int get hashCode => Object.hash(enabled, updatedAt, source, policyVersion);

  @override
  String toString() =>
      'AnalyticsConsent(enabled: $enabled, updatedAt: $updatedAt, source: $source, policyVersion: $policyVersion)';
}

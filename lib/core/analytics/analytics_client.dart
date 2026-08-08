// ignore_for_file: public_member_api_docs

/// LYTHAUS ANALYTICS CLIENT
///
/// 🎯 Purpose: Privacy-safe analytics abstraction layer
/// 🔐 Privacy: Explicit opt-in, no PII, pseudonymous IDs only
/// 📊 Architecture: Provider-agnostic interface for analytics tracking
library;

import 'package:meta/meta.dart';

/// Abstract analytics client interface.
///
/// Implementations must:
/// - Never send PII (email, name, phone, precise location)
/// - Use pseudonymous user IDs only (internal UUIDv7, not provider IDs)
/// - Respect consent state at all times
/// - Batch events for network efficiency
@immutable
abstract class AnalyticsClient {
  /// Log an analytics event with optional properties.
  ///
  /// Properties must be:
  /// - Scalar types (string, number, boolean) or small arrays
  /// - Never contain free-text user input that might leak PII
  /// - Kept to reasonable size (max 20 keys recommended)
  Future<void> logEvent(String name, {Map<String, Object?>? properties});

  /// Set pseudonymous user ID for session correlation.
  ///
  /// MUST be internal user ID (UUIDv7), never:
  /// - Email addresses
  /// - External provider-specific IDs
  /// - Device identifiers
  ///
  /// Pass null to clear user context (e.g., on sign-out).
  Future<void> setUserId(String? userId);

  /// Set persistent user properties for analytics segmentation.
  ///
  /// Examples: account_age_days, user_tier, platform
  /// MUST NOT include PII.
  Future<void> setUserProperties(Map<String, Object?> properties);

  /// Reset analytics state (called on sign-out or account delete).
  ///
  /// Clears:
  /// - User ID
  /// - User properties
  /// - Pending events (flush or discard per implementation)
  Future<void> reset();
}

/// Null implementation that does nothing.
///
/// Used when analytics is disabled or consent is revoked.
class NullAnalyticsClient implements AnalyticsClient {
  const NullAnalyticsClient();

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    // No-op
  }

  @override
  Future<void> setUserId(String? userId) async {
    // No-op
  }

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {
    // No-op
  }

  @override
  Future<void> reset() async {
    // No-op
  }
}

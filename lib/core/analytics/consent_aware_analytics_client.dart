// ignore_for_file: public_member_api_docs

/// LYTHAUS CONSENT-AWARE ANALYTICS CLIENT
///
/// 🎯 Purpose: Wrapper that enforces consent before analytics
/// 🔐 Privacy: All operations become no-ops when consent is disabled
/// 📊 Architecture: Decorator pattern around real analytics client
library;

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';

/// Analytics client wrapper that enforces consent.
///
/// When consent is disabled, all operations are no-ops.
/// When consent is enabled, delegates to the underlying client.
///
/// Note: Not immutable as consent can be updated at runtime.
// ignore: must_be_immutable
class ConsentAwareAnalyticsClient implements AnalyticsClient {
  ConsentAwareAnalyticsClient({
    required AnalyticsClient innerClient,
    required AnalyticsConsent consent,
  }) : _innerClient = innerClient,
       _consent = consent;

  final AnalyticsClient _innerClient;
  AnalyticsConsent _consent;

  /// Update consent state at runtime
  void updateConsent(AnalyticsConsent newConsent) {
    _consent = newConsent;
  }

  /// Check if analytics is enabled
  bool get isEnabled => _consent.enabled;

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    if (!_consent.enabled) return;
    return _innerClient.logEvent(name, properties: properties);
  }

  @override
  Future<void> setUserId(String? userId) async {
    if (!_consent.enabled) return;
    return _innerClient.setUserId(userId);
  }

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {
    if (!_consent.enabled) return;
    return _innerClient.setUserProperties(properties);
  }

  @override
  Future<void> reset() async {
    if (!_consent.enabled) return;
    return _innerClient.reset();
  }
}

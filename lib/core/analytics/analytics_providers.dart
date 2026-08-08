// ignore_for_file: public_member_api_docs

/// LYTHAUS ANALYTICS PROVIDERS
///
/// 🎯 Purpose: Riverpod providers for analytics client and consent
/// 🔐 Privacy: Wires consent-aware analytics throughout the app
/// 📊 Architecture: Provider-based dependency injection
library;

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_consent_storage.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/consent_aware_analytics_client.dart';
import 'package:lythaus/core/analytics/http_analytics_client.dart';

/// Provider for analytics consent storage
final analyticsConsentStorageProvider = Provider<AnalyticsConsentStorage>((
  ref,
) {
  return AnalyticsConsentStorage(storage: const FlutterSecureStorage());
});

/// Provider for one-time analytics event tracking
final analyticsEventTrackerProvider = Provider<AnalyticsEventTracker>((ref) {
  return AnalyticsEventTracker(storage: const FlutterSecureStorage());
});

/// Provider for current analytics consent state
final analyticsConsentProvider =
    StateNotifierProvider<AnalyticsConsentNotifier, AnalyticsConsent>((ref) {
      return AnalyticsConsentNotifier(
        storage: ref.watch(analyticsConsentStorageProvider),
      );
    });

/// State notifier for analytics consent
class AnalyticsConsentNotifier extends StateNotifier<AnalyticsConsent> {
  AnalyticsConsentNotifier({required AnalyticsConsentStorage storage})
    : _storage = storage,
      super(AnalyticsConsent.defaultConsent()) {
    _loadConsent();
  }

  final AnalyticsConsentStorage _storage;

  /// Load consent from storage on init
  Future<void> _loadConsent() async {
    final consent = await _storage.load();
    state = consent;
  }

  /// Grant analytics consent
  Future<void> grantConsent(ConsentSource source) async {
    final newConsent = state.copyWith(
      enabled: true,
      updatedAt: DateTime.now(),
      source: source,
    );
    state = newConsent;
    await _storage.save(newConsent);
  }

  /// Revoke analytics consent
  Future<void> revokeConsent(ConsentSource source) async {
    final newConsent = state.copyWith(
      enabled: false,
      updatedAt: DateTime.now(),
      source: source,
    );
    state = newConsent;
    await _storage.save(newConsent);
  }

  /// Clear consent (used during account deletion)
  Future<void> clearConsent() async {
    state = AnalyticsConsent.defaultConsent();
    await _storage.clear();
  }
}

/// Provider for the analytics client
final analyticsClientProvider = Provider<AnalyticsClient>((ref) {
  final consent = ref.watch(analyticsConsentProvider);

  // If consent is disabled, return null client
  if (!consent.enabled) {
    return const NullAnalyticsClient();
  }

  // Create HTTP analytics client
  final dio = ref.watch(httpClientProvider);

  // Get app version and platform
  // Note: In production, get app version via package_info_plus
  final platform = _getPlatformName();

  final httpClient = HttpAnalyticsClient(
    dio: dio,
    appVersion: '1.0.0', // TODO: Get from package_info_plus
    platform: platform,
  );

  // Wrap in consent-aware client
  return ConsentAwareAnalyticsClient(innerClient: httpClient, consent: consent);
});

/// Get platform name for analytics
String _getPlatformName() {
  if (kIsWeb) return 'web';
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return 'android';
    case TargetPlatform.iOS:
      return 'ios';
    case TargetPlatform.windows:
      return 'windows';
    case TargetPlatform.macOS:
      return 'macos';
    case TargetPlatform.linux:
      return 'linux';
    case TargetPlatform.fuchsia:
      return 'fuchsia';
  }
}

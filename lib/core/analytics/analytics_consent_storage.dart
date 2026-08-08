// ignore_for_file: public_member_api_docs

/// LYTHAUS ANALYTICS CONSENT STORAGE
///
/// 🎯 Purpose: Persist and retrieve analytics consent state
/// 🔐 Privacy: Local storage only, no remote sync
/// 📋 Compliance: Persistent consent tracking for GDPR/POPIA
library;

import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:lythaus/core/analytics/analytics_consent.dart';

/// Storage key for analytics consent
const String _consentStorageKey = 'analytics_consent';

/// Service for persisting analytics consent.
///
/// Uses secure storage to persist consent state across app restarts.
class AnalyticsConsentStorage {
  AnalyticsConsentStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  /// Load consent from storage, or return default (disabled) consent.
  Future<AnalyticsConsent> load() async {
    try {
      final json = await _storage.read(key: _consentStorageKey);
      if (json == null || json.isEmpty) {
        return AnalyticsConsent.defaultConsent();
      }

      final decoded = jsonDecode(json) as Map<String, dynamic>;
      return AnalyticsConsent.fromJson(decoded);
    } catch (e) {
      // On any error, return default consent (opt-out)
      return AnalyticsConsent.defaultConsent();
    }
  }

  /// Save consent to storage.
  Future<void> save(AnalyticsConsent consent) async {
    try {
      final json = jsonEncode(consent.toJson());
      await _storage.write(key: _consentStorageKey, value: json);
    } catch (e) {
      // Silently fail; consent defaults to opt-out if save fails
      // In production, consider logging to monitoring
    }
  }

  /// Clear consent from storage (used during account deletion).
  Future<void> clear() async {
    try {
      await _storage.delete(key: _consentStorageKey);
    } catch (e) {
      // Silently fail
    }
  }
}

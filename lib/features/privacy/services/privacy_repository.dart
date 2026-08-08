// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';

const _lastExportKey = 'privacy.lastExportAt';
const _defaultCooldown = Duration(hours: 24);

/// Snapshot of persisted export metadata.
class ExportSnapshot {
  const ExportSnapshot({
    this.lastExportAt,
    this.remainingCooldown = Duration.zero,
    this.serverState,
  });

  final DateTime? lastExportAt;
  final Duration remainingCooldown;
  final String? serverState;
}

/// Application-level exception surfaced to the controller/UI.
class PrivacyException implements Exception {
  const PrivacyException(this.type, this.message, {this.retryAfter});

  final PrivacyErrorType type;
  final String message;
  final Duration? retryAfter;
}

/// Repository composing API + local persistence for privacy flows.
class PrivacyRepository {
  PrivacyRepository({
    required PrivacyApi api,
    required FlutterSecureStorage storage,
    required AppLogger logger,
    Duration? cooldownWindow,
    DateTime Function()? clock,
  }) : _api = api,
       _storage = storage,
       _logger = logger,
       _cooldownWindow = cooldownWindow ?? _defaultCooldown,
       _now = clock ?? DateTime.now;

  final PrivacyApi _api;
  final FlutterSecureStorage _storage;
  final AppLogger _logger;
  final Duration _cooldownWindow;
  final DateTime Function() _now;

  Duration get cooldownWindow => _cooldownWindow;
  DateTime estimateLastExportFromRemaining(Duration remaining) =>
      _deriveTimestampFromRemaining(remaining);

  Future<ExportSnapshot> loadPersistedSnapshot() async {
    final stored = await _readLastExportUtc();
    return _snapshotFrom(utcTimestamp: stored);
  }

  Future<void> clearPersistedExport() async {
    await _storage.delete(key: _lastExportKey);
  }

  Future<ExportSnapshot> requestExport({required String authToken}) async {
    try {
      _logger.info('privacy_repository.request_export');
      final result = await _api.requestExport(authToken: authToken);
      final acceptedAtUtc = result.acceptedAt.toUtc();

      await _persistLastExport(acceptedAtUtc);

      return _snapshotFrom(
        utcTimestamp: acceptedAtUtc,
        overrideRemaining: result.retryAfter,
        serverState: 'accepted',
      );
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<ExportSnapshot> fetchRemoteStatus({required String authToken}) async {
    try {
      _logger.info('privacy_repository.fetch_remote_status');
      final status = await _api.getExportStatus(authToken: authToken);

      DateTime? acceptedAtUtc = status.acceptedAt?.toUtc();

      if (acceptedAtUtc == null && status.retryAfterSeconds != null) {
        acceptedAtUtc = _deriveTimestampFromRemaining(
          Duration(seconds: status.retryAfterSeconds!),
        );
      }

      if (acceptedAtUtc != null) {
        await _persistLastExport(acceptedAtUtc);
      }

      return _snapshotFrom(
        utcTimestamp: acceptedAtUtc ?? await _readLastExportUtc(),
        serverState: status.state,
      );
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {
    try {
      _logger.info('privacy_repository.delete_account');
      await _api.deleteAccount(authToken: authToken, hardDelete: hardDelete);
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<void> _persistLastExport(DateTime whenUtc) async {
    await _storage.write(
      key: _lastExportKey,
      value: whenUtc.toUtc().toIso8601String(),
    );
  }

  Future<DateTime?> _readLastExportUtc() async {
    final stored = await _storage.read(key: _lastExportKey);
    if (stored == null) return null;
    return DateTime.tryParse(stored)?.toUtc();
  }

  ExportSnapshot _snapshotFrom({
    DateTime? utcTimestamp,
    Duration? overrideRemaining,
    String? serverState,
  }) {
    final remaining = overrideRemaining ?? _remainingFrom(utcTimestamp);
    Duration positiveRemaining = remaining.isNegative
        ? Duration.zero
        : remaining;
    if (positiveRemaining > _cooldownWindow) {
      positiveRemaining = _cooldownWindow;
    }

    return ExportSnapshot(
      lastExportAt: utcTimestamp?.toLocal(),
      remainingCooldown: positiveRemaining,
      serverState: serverState,
    );
  }

  Duration _remainingFrom(DateTime? utcTimestamp) {
    if (utcTimestamp == null) return Duration.zero;
    final expiresAt = utcTimestamp.add(_cooldownWindow);
    return expiresAt.difference(_now().toUtc());
  }

  DateTime _deriveTimestampFromRemaining(Duration remaining) {
    final normalized = remaining > _cooldownWindow
        ? _cooldownWindow
        : remaining;
    final elapsed = _cooldownWindow - normalized;
    return _now().toUtc().subtract(elapsed);
  }

  PrivacyException _mapApiException(PrivacyApiException error) {
    switch (error.type) {
      case PrivacyErrorType.unauthorized:
        return const PrivacyException(
          PrivacyErrorType.unauthorized,
          'Session expired. Please sign in.',
        );
      case PrivacyErrorType.rateLimited:
        return PrivacyException(
          PrivacyErrorType.rateLimited,
          'Too many requests. Try again later.',
          retryAfter: error.retryAfter,
        );
      case PrivacyErrorType.network:
        return const PrivacyException(
          PrivacyErrorType.network,
          'Something went wrong. Try again.',
        );
      case PrivacyErrorType.server:
        return const PrivacyException(
          PrivacyErrorType.server,
          'Something went wrong. Try again.',
        );
    }
  }
}

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) {
  final api = ref.watch(privacyApiProvider);
  final storage = ref.watch(secureStorageProvider);
  final logger = ref.watch(appLoggerProvider);
  return PrivacyRepository(api: api, storage: storage, logger: logger);
});

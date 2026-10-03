// ignore_for_file: public_member_api_docs

import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';

/// Server status and cooldown are independent: a completed export may still
/// have a cooldown before another request is permitted.
class ExportSnapshot {
  const ExportSnapshot({
    this.lastExportAt,
    this.remainingCooldown = Duration.zero,
    this.serverState,
    this.requestId,
    this.completedAt,
    this.canRequest = false,
    this.cooldownKnown = false,
  });
  final DateTime? lastExportAt;
  final Duration remainingCooldown;
  final String? serverState;
  final String? requestId;
  final DateTime? completedAt;
  final bool canRequest;
  final bool cooldownKnown;
}

class PrivacyException implements Exception {
  const PrivacyException(this.type, this.message, {this.retryAfter});
  final PrivacyErrorType type;
  final String message;
  final Duration? retryAfter;
}

/// Cache only an owner-scoped timestamp for continuity. Cached history never
/// grants permission to submit a request or download an export.
class PrivacyRepository {
  PrivacyRepository({
    required PrivacyApi api,
    required FlutterSecureStorage storage,
    required AppLogger logger,
    this.actorId,
  }) : _api = api,
       _storage = storage,
       _logger = logger;

  final PrivacyApi _api;
  final FlutterSecureStorage _storage;
  final AppLogger _logger;
  final String? actorId;
  String get _cacheKey =>
      'privacy.lastExportAt.v2.${Uri.encodeComponent(actorId!)}';

  Future<ExportSnapshot> loadPersistedSnapshot() async {
    if (actorId == null) return const ExportSnapshot();
    try {
      // The old unscoped privacy.lastExportAt key has no verifiable owner.
      // Leave it intact for rollback; never attribute it to this account.
      final cached = await _storage.read(key: _cacheKey);
      return ExportSnapshot(
        lastExportAt: DateTime.tryParse(cached ?? '')?.toLocal(),
      );
    } catch (_) {
      _logger.warning('privacy_cache_unavailable');
      return const ExportSnapshot();
    }
  }

  Future<void> clearPersistedExport() async {
    if (actorId != null) await _storage.delete(key: _cacheKey);
  }

  Future<void> _persist(DateTime? timestamp) async {
    if (actorId == null) return;
    try {
      if (timestamp == null) {
        await _storage.delete(key: _cacheKey);
      } else {
        await _storage.write(
          key: _cacheKey,
          value: timestamp.toUtc().toIso8601String(),
        );
      }
    } catch (_) {
      // A local cache failure must not turn an accepted server mutation into
      // a failure that encourages duplicate submissions.
      _logger.warning('privacy_cache_unavailable');
    }
  }

  Future<ExportSnapshot> requestExport({required String authToken}) async {
    try {
      _logger.info('privacy_repository.request_export');
      final result = await _api.requestExport(authToken: authToken);
      await _persist(result.acceptedAt);
      return ExportSnapshot(
        lastExportAt: result.acceptedAt.toLocal(),
        requestId: result.requestId,
        serverState: 'received',
        remainingCooldown: _positive(result.retryAfter ?? Duration.zero),
        cooldownKnown: result.retryAfter != null,
      );
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<ExportSnapshot> fetchRemoteStatus({required String authToken}) async {
    try {
      final status = await _api.getExportStatus(authToken: authToken);
      await _persist(status.acceptedAt);
      return _snapshot(status);
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<ExportStatusDTO> fetchDeletionStatus({
    required String authToken,
  }) async {
    try {
      return await _api.getDeleteStatus(authToken: authToken);
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<ExportStatusDTO> deleteAccount({required String authToken}) async {
    try {
      return await _api.deleteAccount(authToken: authToken);
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  Future<Uint8List> downloadExport({
    required String authToken,
    required String requestId,
  }) async {
    try {
      return await _api.downloadExport(
        authToken: authToken,
        requestId: requestId,
      );
    } on PrivacyApiException catch (error) {
      throw _mapApiException(error);
    }
  }

  ExportSnapshot _snapshot(ExportStatusDTO status) => ExportSnapshot(
    lastExportAt: status.acceptedAt?.toLocal(),
    remainingCooldown: _positive(
      Duration(seconds: status.retryAfterSeconds ?? 0),
    ),
    serverState: status.state,
    requestId: status.requestId,
    completedAt: status.completedAt,
    canRequest: status.canRequest,
    cooldownKnown:
        status.retryAfterSeconds != null ||
        status.requestState == PrivacyRequestState.idle,
  );

  Duration _positive(Duration value) =>
      value.isNegative ? Duration.zero : value;

  PrivacyException _mapApiException(
    PrivacyApiException error,
  ) => PrivacyException(error.type, switch (error.type) {
    PrivacyErrorType.unauthorized => 'Session expired. Please sign in.',
    PrivacyErrorType.rateLimited =>
      'A request is active or the request limit has been reached. Refresh status before trying again.',
    PrivacyErrorType.network ||
    PrivacyErrorType.server => 'Something went wrong. Try again.',
  }, retryAfter: error.retryAfter);
}

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) {
  return PrivacyRepository(
    api: ref.watch(privacyApiProvider),
    storage: ref.watch(secureStorageProvider),
    logger: ref.watch(appLoggerProvider),
    actorId: ref.watch(currentUserProvider.select((user) => user?.id)),
  );
});

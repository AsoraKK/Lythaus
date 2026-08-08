// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:meta/meta.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';

/// Riverpod controller orchestrating privacy flows.
class PrivacyController extends StateNotifier<PrivacyState> {
  PrivacyController({
    required Ref ref,
    required PrivacyRepository repository,
    required AppLogger logger,
    required AnalyticsClient analyticsClient,
    DateTime Function()? clock,
    Future<void> Function()? onSignOut,
  }) : _ref = ref,
       _repository = repository,
       _logger = logger,
       _analyticsClient = analyticsClient,
       _now = clock ?? DateTime.now,
       _cooldownWindow = repository.cooldownWindow,
       _signOut =
           onSignOut ??
           (() async {
             await ref.read(authStateProvider.notifier).signOut();
           }),
       super(const PrivacyState()) {
    _hydrate();
  }

  final Ref _ref;
  final PrivacyRepository _repository;
  final AppLogger _logger;
  final AnalyticsClient _analyticsClient;
  final DateTime Function() _now;
  final Duration _cooldownWindow;
  final Future<void> Function() _signOut;

  Timer? _cooldownTimer;

  /// Expose delete confirmation state to the UI.
  void beginDeleteConfirmation() {
    _logger.info('privacy_delete_confirm_opened');
    state = state.copyWith(
      deleteStatus: DeleteStatus.confirming,
      clearError: true,
    );
  }

  void cancelDeleteConfirmation() {
    state = state.copyWith(deleteStatus: DeleteStatus.idle, clearError: true);
  }

  /// Clears the latest surfaced error.
  void clearError() {
    state = state.copyWith(clearError: true);
  }

  Future<void> refreshStatus() async {
    final token = await _requireAuthToken();
    if (token == null) return;

    try {
      final snapshot = await _repository.fetchRemoteStatus(authToken: token);
      _applySnapshot(snapshot);
    } on PrivacyException catch (error) {
      await _handleExportError(error);
    }
  }

  Future<void> export() async {
    if (!state.canRequestExport && state.exportStatus != ExportStatus.failed) {
      return;
    }

    final token = await _requireAuthToken();
    if (token == null) return;

    _logger.info('privacy_export_tapped');
    await _analyticsClient.logEvent(AnalyticsEvents.privacyExportRequested);
    state = state.copyWith(
      exportStatus: ExportStatus.requesting,
      clearError: true,
    );

    try {
      final snapshot = await _repository.requestExport(authToken: token);

      state = state.copyWith(
        exportStatus: ExportStatus.accepted,
        lastExportAt: snapshot.lastExportAt,
        remainingCooldown: snapshot.remainingCooldown,
      );

      _logger.info('privacy_export_accepted');
      _enterCooldown(snapshot);
    } on PrivacyException catch (error) {
      await _handleExportError(error);
    }
  }

  Future<void> delete({bool hardDelete = true}) async {
    final token = await _requireAuthToken();
    if (token == null) return;

    await _analyticsClient.logEvent(AnalyticsEvents.privacyDeleteRequested);

    state = state.copyWith(
      deleteStatus: DeleteStatus.deleting,
      clearError: true,
    );

    try {
      await _repository.deleteAccount(authToken: token, hardDelete: hardDelete);

      _logger.info('privacy_delete_confirmed');

      state = state.copyWith(deleteStatus: DeleteStatus.requested);
    } on PrivacyException catch (error) {
      _logger.warning('privacy_delete_failed');
      state = state.copyWith(
        deleteStatus: DeleteStatus.failed,
        error: error.message,
      );
      if (error.type == PrivacyErrorType.unauthorized) {
        await _handleUnauthorized();
      }
    }
  }

  @visibleForTesting
  void debugTickCooldown() => _handleCooldownTick();

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }

  Future<void> _hydrate() async {
    final snapshot = await _repository.loadPersistedSnapshot();
    _applySnapshot(snapshot);
  }

  Future<String?> _requireAuthToken() async {
    final token = await _ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      await _handleUnauthorized();
      return null;
    }
    return token;
  }

  Future<void> _handleUnauthorized() async {
    await _signOut();
    final deleteStatus =
        state.deleteStatus == DeleteStatus.deleting ||
            state.deleteStatus == DeleteStatus.confirming
        ? DeleteStatus.failed
        : state.deleteStatus;
    state = state.copyWith(
      exportStatus: ExportStatus.failed,
      deleteStatus: deleteStatus,
      error: 'Session expired. Please sign in.',
    );
  }

  void _applySnapshot(ExportSnapshot snapshot) {
    final exportStatus = _statusFromServer(
      snapshot.serverState,
      snapshot.remainingCooldown,
    );

    state = state.copyWith(
      exportStatus: exportStatus,
      lastExportAt: snapshot.lastExportAt,
      remainingCooldown: snapshot.remainingCooldown,
      clearError: true,
    );

    if (snapshot.remainingCooldown > Duration.zero) {
      _startCooldownTicker();
    } else {
      _cancelCooldownTicker();
    }
  }

  ExportStatus _statusFromServer(String? serverState, Duration remaining) {
    if (remaining > Duration.zero) {
      return ExportStatus.coolingDown;
    }

    switch (serverState) {
      case 'queued':
        return ExportStatus.queued;
      case 'email_sent':
      case 'accepted':
        return ExportStatus.accepted;
      case 'failed':
        return ExportStatus.failed;
      default:
        return ExportStatus.idle;
    }
  }

  void _enterCooldown(ExportSnapshot snapshot) {
    state = state.copyWith(
      exportStatus: ExportStatus.coolingDown,
      lastExportAt: snapshot.lastExportAt,
      remainingCooldown: snapshot.remainingCooldown,
      clearError: true,
    );

    if (snapshot.remainingCooldown > Duration.zero) {
      _startCooldownTicker();
    } else {
      _cancelCooldownTicker();
    }
  }

  Future<void> _handleExportError(PrivacyException error) async {
    if (error.type == PrivacyErrorType.rateLimited) {
      _logger.warning('privacy_export_rate_limited');
    } else if (error.type == PrivacyErrorType.unauthorized) {
      await _handleUnauthorized();
      return;
    }

    final Duration? derivedRemaining = error.retryAfter;
    DateTime? derivedTimestamp;

    if (derivedRemaining != null && derivedRemaining > Duration.zero) {
      derivedTimestamp = _repository.estimateLastExportFromRemaining(
        derivedRemaining,
      );
    }

    state = state.copyWith(
      exportStatus: ExportStatus.failed,
      error: error.message,
      lastExportAt: derivedTimestamp?.toLocal() ?? state.lastExportAt,
      remainingCooldown: derivedRemaining ?? state.remainingCooldown,
    );

    if (derivedRemaining != null && derivedRemaining > Duration.zero) {
      _startCooldownTicker();
    } else if (state.remainingCooldown <= Duration.zero) {
      _cancelCooldownTicker();
    }
  }

  void _startCooldownTicker() {
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => _handleCooldownTick(),
    );
  }

  void _cancelCooldownTicker() {
    _cooldownTimer?.cancel();
    _cooldownTimer = null;
  }

  void _handleCooldownTick() {
    final lastExport = state.lastExportAt;
    if (lastExport == null) {
      _cancelCooldownTicker();
      state = state.copyWith(
        exportStatus: ExportStatus.idle,
        remainingCooldown: Duration.zero,
      );
      return;
    }

    final nowUtc = _now().toUtc();
    final remaining = lastExport
        .toUtc()
        .add(_cooldownWindow)
        .difference(nowUtc);

    if (remaining <= Duration.zero) {
      _cancelCooldownTicker();
      state = state.copyWith(
        exportStatus: ExportStatus.idle,
        remainingCooldown: Duration.zero,
      );
    } else {
      state = state.copyWith(
        exportStatus: ExportStatus.coolingDown,
        remainingCooldown: remaining,
      );
    }
  }
}

// coverage:ignore-start
final privacyControllerProvider =
    StateNotifierProvider.autoDispose<PrivacyController, PrivacyState>((ref) {
      final repository = ref.watch(privacyRepositoryProvider);
      final logger = ref.watch(appLoggerProvider);
      final controller = PrivacyController(
        ref: ref,
        repository: repository,
        logger: logger,
        analyticsClient: ref.watch(analyticsClientProvider),
      );
      ref.onDispose(controller.dispose);
      return controller;
    });
// coverage:ignore-end

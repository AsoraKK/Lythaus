// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:meta/meta.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';

class PrivacyController extends StateNotifier<PrivacyState> {
  PrivacyController({
    required Ref ref,
    required PrivacyRepository repository,
    required AppLogger logger,
    required AnalyticsClient analyticsClient,
    AnalyticsClient Function()? analyticsClientForOperation,
    DateTime Function()? clock,
    Future<void> Function()? onSignOut,
    bool Function()? isCurrentSession,
  }) : _ref = ref,
       _repository = repository,
       _logger = logger,
       _analyticsClientForOperation =
           analyticsClientForOperation ?? (() => analyticsClient),
       _now = clock ?? DateTime.now,
       _isCurrentSession = isCurrentSession ?? (() => true),
       _signOut =
           onSignOut ?? (() => ref.read(authStateProvider.notifier).signOut()),
       super(PrivacyState(isGuest: repository.actorId == null)) {
    unawaited(_hydrate());
  }

  final Ref _ref;
  final PrivacyRepository _repository;
  final AppLogger _logger;
  final AnalyticsClient Function() _analyticsClientForOperation;
  final DateTime Function() _now;
  final Future<void> Function() _signOut;
  final bool Function() _isCurrentSession;
  final _disposed = Completer<String?>();
  Timer? _cooldownTimer;
  DateTime? _cooldownUntil;
  int _epoch = 0;
  bool get isCurrentSession => mounted && _isCurrentSession();
  String? get exportRequestId => isCurrentSession ? state.requestId : null;
  void cancelPendingSession() {
    _cooldownTimer?.cancel();
    if (!_disposed.isCompleted) _disposed.complete(null);
  }

  bool _current(int epoch) => isCurrentSession && epoch == _epoch;

  void beginDeleteConfirmation() {
    if (isCurrentSession && state.canRequestDeletion) {
      state = state.copyWith(
        deleteStatus: DeleteStatus.confirming,
        clearError: true,
      );
    }
  }

  void cancelDeleteConfirmation() {
    if (isCurrentSession) {
      state = state.copyWith(deleteStatus: DeleteStatus.idle, clearError: true);
    }
  }

  void clearError() {
    if (isCurrentSession) {
      state = state.copyWith(clearError: true);
    }
  }

  Future<void> refreshStatus() async {
    if (!isCurrentSession ||
        state.isGuest ||
        state.exportStatus == ExportStatus.requesting ||
        state.deleteStatus == DeleteStatus.deleting ||
        state.downloading) {
      return;
    }
    final epoch = ++_epoch;
    state = state.copyWith(
      refreshing: true,
      clearError: true,
      exportAllowed: false,
      deleteAllowed: false,
      exportStatus: ExportStatus.unknown,
      deleteStatus: DeleteStatus.unknown,
    );
    final token = await _token();
    if (token == null || !_current(epoch)) return;
    try {
      final export = await _repository.fetchRemoteStatus(authToken: token);
      if (!_current(epoch)) return;
      _applySnapshot(export);
      final deletion = await _repository.fetchDeletionStatus(authToken: token);
      if (!_current(epoch)) return;
      _applyDeletion(deletion);
    } on PrivacyException catch (error) {
      if (_current(epoch)) await _handleError(error);
    } finally {
      if (_current(epoch)) state = state.copyWith(refreshing: false);
    }
  }

  Future<void> export() async {
    if (!isCurrentSession || !state.canRequestExport) return;
    final epoch = ++_epoch;
    state = state.copyWith(
      exportStatus: ExportStatus.requesting,
      exportAllowed: false,
      clearError: true,
    );
    final token = await _token();
    if (token == null || !_current(epoch)) return;
    try {
      await _analyticsClientForOperation().logEvent(
        AnalyticsEvents.privacyExportRequested,
      );
      if (!_current(epoch)) return;
      final snapshot = await _repository.requestExport(authToken: token);
      if (_current(epoch)) _applySnapshot(snapshot);
    } on PrivacyException catch (error) {
      if (_current(epoch)) {
        state = state.copyWith(exportStatus: ExportStatus.failed);
        await _handleError(error);
      }
    }
  }

  Future<void> delete() async {
    if (!isCurrentSession || !state.canRequestDeletion) return;
    final epoch = ++_epoch;
    state = state.copyWith(
      deleteStatus: DeleteStatus.deleting,
      deleteAllowed: false,
      clearError: true,
    );
    final token = await _token();
    if (token == null || !_current(epoch)) return;
    try {
      await _analyticsClientForOperation().logEvent(
        AnalyticsEvents.privacyDeleteRequested,
      );
      if (!_current(epoch)) return;
      final result = await _repository.deleteAccount(authToken: token);
      if (_current(epoch)) _applyDeletion(result);
    } on PrivacyException catch (error) {
      if (_current(epoch)) {
        state = state.copyWith(deleteStatus: DeleteStatus.failed);
        await _handleError(error);
      }
    }
  }

  /// Bytes stay within the active caller; they are never cached in state or
  /// storage. The UI checks this session again before opening a save dialog.
  Future<Uint8List?> download() async {
    if (!isCurrentSession || !state.canDownload) return null;
    final requestId = state.requestId!;
    state = state.copyWith(downloading: true, clearError: true);
    final token = await _token();
    if (token == null || !isCurrentSession) return null;
    try {
      final bytes = await _repository.downloadExport(
        authToken: token,
        requestId: requestId,
      );
      return isCurrentSession && state.requestId == requestId ? bytes : null;
    } on PrivacyException catch (error) {
      if (isCurrentSession) await _handleError(error);
      return null;
    } finally {
      if (isCurrentSession) state = state.copyWith(downloading: false);
    }
  }

  Future<void> _hydrate() async {
    final snapshot = await _repository.loadPersistedSnapshot();
    if (isCurrentSession && _epoch == 0) {
      state = state.copyWith(lastExportAt: snapshot.lastExportAt);
    }
  }

  Future<String?> _token() async {
    if (!isCurrentSession || state.isGuest) return null;
    try {
      final token = await Future.any<String?>([
        _ref.read(jwtProvider.future),
        _disposed.future,
      ]);
      if (!isCurrentSession) return null;
      if (token != null && token.isNotEmpty) return token;
    } catch (_) {
      if (!isCurrentSession) return null;
      state = state.copyWith(
        exportStatus: state.exportStatus == ExportStatus.requesting
            ? ExportStatus.failed
            : state.exportStatus,
        deleteStatus: state.deleteStatus == DeleteStatus.deleting
            ? DeleteStatus.failed
            : state.deleteStatus,
        downloading: false,
        refreshing: false,
        exportAllowed: false,
        deleteAllowed: false,
        error: 'Unable to check your session. Please try again.',
      );
      return null;
    }
    await _handleError(
      const PrivacyException(
        PrivacyErrorType.unauthorized,
        'Session expired. Please sign in.',
      ),
    );
    return null;
  }

  Future<void> _handleError(PrivacyException error) async {
    if (!isCurrentSession) return;
    if (error.type == PrivacyErrorType.unauthorized) {
      _cooldownTimer?.cancel();
      state = const PrivacyState(
        error: 'Session expired. Please sign in.',
        isGuest: true,
      );
      // Check before the side effect; never sign out a replacement session.
      if (isCurrentSession) await _signOut();
      return;
    }
    _logger.warning('privacy_request_failed');
    final remaining = error.retryAfter;
    if (remaining != null && remaining > Duration.zero) {
      _setCooldown(remaining);
    }
    state = state.copyWith(
      error: error.message,
      remainingCooldown: remaining,
      exportAllowed: false,
      deleteAllowed: false,
    );
  }

  void _applySnapshot(ExportSnapshot snapshot) {
    final status = switch (privacyRequestState(snapshot.serverState ?? '')) {
      PrivacyRequestState.idle => ExportStatus.idle,
      PrivacyRequestState.received => ExportStatus.received,
      PrivacyRequestState.processing => ExportStatus.processing,
      PrivacyRequestState.blocked => ExportStatus.blocked,
      PrivacyRequestState.completed => ExportStatus.completed,
      PrivacyRequestState.failed => ExportStatus.failed,
      PrivacyRequestState.unknown => ExportStatus.unknown,
    };
    // Replacing the complete server projection also clears a previously cached
    // request ID and timestamp when this owner's response is request:null.
    state = state.copyWith(clearExport: true);
    state = state.copyWith(
      exportStatus: status,
      requestId: snapshot.requestId,
      lastExportAt: snapshot.lastExportAt,
      completedAt: snapshot.completedAt,
      remainingCooldown: snapshot.remainingCooldown,
      exportAllowed: snapshot.canRequest,
      cooldownKnown: snapshot.cooldownKnown,
      clearError: true,
    );
    _setCooldown(snapshot.remainingCooldown);
  }

  void _applyDeletion(ExportStatusDTO result) {
    final status = switch (result.requestState) {
      PrivacyRequestState.idle => DeleteStatus.idle,
      PrivacyRequestState.received => DeleteStatus.requested,
      PrivacyRequestState.processing => DeleteStatus.processing,
      PrivacyRequestState.blocked => DeleteStatus.blocked,
      PrivacyRequestState.completed => DeleteStatus.completed,
      PrivacyRequestState.failed => DeleteStatus.failed,
      PrivacyRequestState.unknown => DeleteStatus.unknown,
    };
    state = state.copyWith(clearDeletion: true);
    state = state.copyWith(
      deleteStatus: status,
      deleteRequestId: result.requestId,
      deleteAllowed: result.canRequest && status != DeleteStatus.completed,
    );
  }

  void _setCooldown(Duration remaining) {
    _cooldownTimer?.cancel();
    _cooldownUntil = _now().toUtc().add(remaining);
    if (remaining > Duration.zero) {
      _cooldownTimer = Timer.periodic(
        const Duration(minutes: 1),
        (_) => _handleCooldownTick(),
      );
    }
  }

  @visibleForTesting
  void debugTickCooldown() => _handleCooldownTick();

  void _handleCooldownTick() {
    if (!isCurrentSession || _cooldownUntil == null) return;
    final remaining = _cooldownUntil!.difference(_now().toUtc());
    state = state.copyWith(
      remainingCooldown: remaining.isNegative ? Duration.zero : remaining,
    );
    if (remaining <= Duration.zero) {
      _cooldownTimer?.cancel();
      // Expiry never changes processing/blocked/completed to idle or grants
      // permission locally. Refresh the existing owner endpoint.
      unawaited(refreshStatus());
    }
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    if (!_disposed.isCompleted) _disposed.complete(null);
    super.dispose();
  }
}

final privacyControllerProvider =
    StateNotifierProvider.autoDispose<PrivacyController, PrivacyState>((ref) {
      final revision = ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final actor = ref.watch(currentUserProvider.select((user) => user?.id));
      final controller = PrivacyController(
        ref: ref,
        repository: ref.watch(privacyRepositoryProvider),
        logger: ref.watch(appLoggerProvider),
        analyticsClient: ref.read(analyticsClientProvider),
        analyticsClientForOperation: () => ref.read(analyticsClientProvider),
        isCurrentSession: () =>
            session.revision == revision &&
            ref.read(currentUserProvider)?.id == actor,
      );
      final stop = session.cancelOnChange(controller.cancelPendingSession);
      ref.onDispose(stop);
      return controller;
    });

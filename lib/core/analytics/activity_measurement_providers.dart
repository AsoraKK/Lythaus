// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';

final activityPilotEnabledProvider = Provider<bool>(
  (ref) => const bool.fromEnvironment(
    'ACTIVITY_MEASUREMENT_PILOT',
    defaultValue: false,
  ),
);

final activityMeasurementClientProvider =
    Provider.autoDispose<ActivityMeasurementClient?>((ref) {
      final actor = ref.watch(currentUserProvider);
      if (actor == null || actor.isTemporary) return null;
      final revision = ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final client = DioActivityMeasurementClient(
        dio: ref.watch(secureDioProvider),
        readAuthToken: () => ref.read(jwtProvider.future),
        isCurrentSession: () =>
            session.revision == revision &&
            ref.read(currentUserProvider)?.id == actor.id,
      );
      final stop = session.cancelOnChange(client.cancelPending);
      ref.onDispose(stop);
      ref.onDispose(client.cancelPending);
      return client;
    });

class ActivityMeasurementState {
  const ActivityMeasurementState({
    this.consent,
    this.loading = false,
    this.saving = false,
    this.paused = false,
    this.error,
  });
  final ActivityConsentRecord? consent;
  final bool loading;
  final bool saving;
  final bool paused;
  final String? error;
}

class ActivityMeasurementController
    extends StateNotifier<ActivityMeasurementState> {
  ActivityMeasurementController({
    required ActivityMeasurementClient? client,
    required this.collectionEnabled,
    bool Function()? isCurrentSession,
  }) : _client = client,
       _isCurrentSession = isCurrentSession ?? (() => true),
       super(const ActivityMeasurementState()) {
    if (collectionEnabled && client != null) unawaited(refresh());
  }
  final ActivityMeasurementClient? _client;
  final bool collectionEnabled;
  final bool Function() _isCurrentSession;
  int _operation = 0;
  bool _rendering = false;
  bool get current => mounted && _isCurrentSession();
  bool get canManage => _client != null && current;
  bool get canCollect =>
      collectionEnabled &&
      canManage &&
      !state.paused &&
      !state.loading &&
      !state.saving &&
      state.consent?.pilotEnabled == true &&
      state.consent?.granted == true;

  Future<void> refresh() async {
    if (!canManage || state.saving) return;
    final operation = ++_operation;
    state = ActivityMeasurementState(
      consent: state.consent,
      loading: true,
      paused: state.paused,
    );
    try {
      final result = await _client!.status();
      if (!current || operation != _operation) return;
      state = ActivityMeasurementState(consent: result);
    } catch (_) {
      if (current && operation == _operation) {
        state = ActivityMeasurementState(
          consent: state.consent,
          paused: true,
          error:
              'Consent status is unavailable. Activity collection is paused.',
        );
      }
    }
  }

  Future<void> setConsent(bool enabled) async {
    final consent = state.consent;
    if (!canManage || state.loading || state.saving || consent == null) return;
    if (enabled && (!collectionEnabled || !consent.pilotEnabled)) return;
    final operation = ++_operation;
    _client!.cancelRenders();
    state = ActivityMeasurementState(
      consent: consent,
      saving: true,
      paused: true,
    );
    try {
      final result = await _client.setConsent(consent, enabled: enabled);
      if (!current || operation != _operation) return;
      state = ActivityMeasurementState(consent: result);
    } catch (_) {
      if (current && operation == _operation) {
        state = ActivityMeasurementState(
          consent: consent,
          paused: true,
          error: enabled
              ? 'Opt-in could not be confirmed. Activity collection is paused.'
              : 'Withdrawal could not be confirmed. This app has paused collection. Retry withdrawal; server consent may still be active on another device.',
        );
      }
    }
  }

  Future<void> visibleForegroundRender() async {
    if (!canCollect || _rendering) return;
    final consent = state.consent!;
    final operation = _operation;
    _rendering = true;
    try {
      await _client!.recordForegroundRender(consent);
    } catch (_) {
      if (current && operation == _operation) {
        state = ActivityMeasurementState(
          consent: state.consent,
          paused: true,
          error:
              'Activity measurement is unavailable. Review consent to retry.',
        );
      }
    } finally {
      _rendering = false;
    }
  }

  void cancelPendingSession() {
    _operation++;
    _client?.cancelPending();
  }

  @override
  void dispose() {
    cancelPendingSession();
    super.dispose();
  }
}

final activityMeasurementControllerProvider =
    StateNotifierProvider.autoDispose<
      ActivityMeasurementController,
      ActivityMeasurementState
    >((ref) {
      final revision = ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final actor = ref.watch(currentUserProvider.select((user) => user?.id));
      final controller = ActivityMeasurementController(
        client: ref.watch(activityMeasurementClientProvider),
        collectionEnabled: ref.watch(activityPilotEnabledProvider),
        isCurrentSession: () =>
            session.revision == revision &&
            ref.read(currentUserProvider)?.id == actor,
      );
      final stop = session.cancelOnChange(controller.cancelPendingSession);
      ref.onDispose(stop);
      return controller;
    });

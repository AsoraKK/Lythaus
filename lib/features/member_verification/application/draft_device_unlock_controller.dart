// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

enum DraftDeviceUnlockStatus {
  inactive,
  loading,
  unlocked,
  locked,
  authenticating,
  cancelled,
  lockedOut,
  unavailable,
  storageUnavailable,
}

class DraftDeviceUnlockState {
  const DraftDeviceUnlockState(this.status, this.preference);

  final DraftDeviceUnlockStatus status;
  final DeviceUnlockPreference preference;
}

class DraftDeviceUnlockController
    extends StateNotifier<DraftDeviceUnlockState> {
  DraftDeviceUnlockController({
    required this.accountId,
    required DeviceUnlockPreferencesStore store,
    required DeviceUnlockAuthenticator authenticator,
    this.enabled = false,
    Duration Function()? elapsed,
    DateTime Function()? wallTime,
  }) : _store = store,
       _authenticator = authenticator,
       _elapsed = elapsed ?? (Stopwatch()..start()).elapsedGetter,
       _wallTime = wallTime ?? DateTime.now,
       super(
         const DraftDeviceUnlockState(
           DraftDeviceUnlockStatus.inactive,
           DeviceUnlockPreference.off,
         ),
       ) {
    if (accountId.trim().isEmpty) throw ArgumentError('An account is required');
  }

  final String accountId;
  final bool enabled;
  final DeviceUnlockPreferencesStore _store;
  final DeviceUnlockAuthenticator _authenticator;
  final Duration Function() _elapsed;
  final DateTime Function() _wallTime;
  int _revision = 0;
  bool _loaded = false;
  bool _saving = false;
  bool _away = false;
  Duration? _awaySince;
  DateTime? _awayWallTime;
  DeviceUnlockAvailability _availability = DeviceUnlockAvailability.unavailable;

  bool _current(int revision) => enabled && mounted && revision == _revision;

  void _status(DraftDeviceUnlockStatus status) {
    state = DraftDeviceUnlockState(status, state.preference);
  }

  Future<void> initialize() async {
    if (!enabled || !mounted || _loaded || _saving) return;
    final revision = ++_revision;
    _status(DraftDeviceUnlockStatus.loading);
    try {
      final preference = await _store.load(accountId);
      if (!_current(revision)) return;
      final availability = await _authenticator.availability();
      if (!_current(revision)) return;
      _availability = availability;
      _loaded = true;
      state = DraftDeviceUnlockState(_initialStatus(preference), preference);
    } catch (_) {
      if (_current(revision)) {
        _status(DraftDeviceUnlockStatus.storageUnavailable);
      }
    }
  }

  DraftDeviceUnlockStatus _initialStatus(DeviceUnlockPreference preference) =>
      preference == DeviceUnlockPreference.off
      ? DraftDeviceUnlockStatus.unlocked
      : _availability == DeviceUnlockAvailability.available
      ? DraftDeviceUnlockStatus.locked
      : DraftDeviceUnlockStatus.unavailable;

  Future<void> savePreference(DeviceUnlockPreference preference) async {
    if (!enabled ||
        !mounted ||
        !_loaded ||
        _saving ||
        state.status == DraftDeviceUnlockStatus.authenticating) {
      return;
    }
    if (preference != DeviceUnlockPreference.off &&
        _availability != DeviceUnlockAvailability.available) {
      _status(DraftDeviceUnlockStatus.unavailable);
      return;
    }
    _saving = true;
    final revision = ++_revision;
    try {
      await _store.save(accountId, preference);
      if (!_current(revision)) return;
      state = DraftDeviceUnlockState(_initialStatus(preference), preference);
    } catch (_) {
      if (_current(revision)) {
        _status(DraftDeviceUnlockStatus.storageUnavailable);
      }
    } finally {
      _saving = false;
    }
  }

  Future<void> unlock() async {
    if (!enabled ||
        !mounted ||
        !_loaded ||
        _saving ||
        _away ||
        state.preference == DeviceUnlockPreference.off ||
        state.status == DraftDeviceUnlockStatus.unlocked ||
        state.status == DraftDeviceUnlockStatus.authenticating ||
        state.status == DraftDeviceUnlockStatus.storageUnavailable) {
      return;
    }
    final revision = ++_revision;
    _status(DraftDeviceUnlockStatus.authenticating);
    try {
      final result = await _authenticator.unlock();
      if (!_current(revision)) return;
      _status(switch (result) {
        DeviceUnlockResult.unlocked => DraftDeviceUnlockStatus.unlocked,
        DeviceUnlockResult.cancelled => DraftDeviceUnlockStatus.cancelled,
        DeviceUnlockResult.lockedOut => DraftDeviceUnlockStatus.lockedOut,
        DeviceUnlockResult.unavailable => DraftDeviceUnlockStatus.unavailable,
      });
    } catch (_) {
      if (_current(revision)) _status(DraftDeviceUnlockStatus.unavailable);
    }
  }

  void onLifecycleChanged(AppLifecycleState lifecycle) {
    if (!enabled || !mounted) return;
    if (lifecycle != AppLifecycleState.resumed) {
      if (!_away) {
        _awaySince = _elapsed();
        _awayWallTime = _wallTime();
      }
      _away = true;
      if (state.status == DraftDeviceUnlockStatus.authenticating) {
        _revision++;
        _status(DraftDeviceUnlockStatus.locked);
        unawaited(_cancelPrompt());
      }
      return;
    }
    if (!_away) return;
    _away = false;
    final since = _awaySince;
    final wallSince = _awayWallTime;
    _awaySince = null;
    _awayWallTime = null;
    final interval = state.preference.awayInterval;
    if (!_loaded || interval == null || since == null || wallSince == null) {
      return;
    }
    final awayFor = _elapsed() - since;
    final wallAwayFor = _wallTime().difference(wallSince);
    if (state.status == DraftDeviceUnlockStatus.unlocked &&
        (awayFor.isNegative ||
            wallAwayFor.isNegative ||
            awayFor >= interval ||
            wallAwayFor >= interval)) {
      _status(DraftDeviceUnlockStatus.locked);
    }
  }

  Future<void> cancel() async {
    if (!enabled ||
        !mounted ||
        state.status != DraftDeviceUnlockStatus.authenticating) {
      return;
    }
    _revision++;
    _status(DraftDeviceUnlockStatus.cancelled);
    await _cancelPrompt();
  }

  Future<void> _cancelPrompt() async {
    try {
      await _authenticator.cancel();
    } catch (_) {
      return;
    }
  }

  @override
  void dispose() {
    _revision++;
    if (state.status == DraftDeviceUnlockStatus.authenticating) {
      unawaited(_cancelPrompt());
    }
    super.dispose();
  }
}

extension on Stopwatch {
  Duration elapsedGetter() => elapsed;
}

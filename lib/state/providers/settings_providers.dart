// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/guest_preferences_storage.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';

import 'package:lythaus/state/models/settings.dart';

class SettingsController extends StateNotifier<SettingsState> {
  SettingsController({
    String? ownerId,
    Future<PresentationPreferences?> Function()? load,
    Future<PresentationPreferences> Function(PresentationPreferences, String)?
    save,
  }) : _load = load,
       _save = save,
       super(
         SettingsState(
           preferencesOwnerId: ownerId,
           preferencesLoading: load != null,
           preferencesAvailable: load == null,
         ),
       ) {
    if (load != null) {
      final initialOperation = _operation;
      scheduleMicrotask(() {
        if (_current(initialOperation)) unawaited(reload());
      });
    }
  }

  final Future<PresentationPreferences?> Function()? _load;
  final Future<PresentationPreferences> Function(
    PresentationPreferences,
    String,
  )?
  _save;
  int _operation = 0;
  PresentationPreferences? _pending;
  String? _pendingKey;

  bool _current(int operation) => mounted && operation == _operation;

  void clearSession() {
    _operation++;
    _pending = null;
    _pendingKey = null;
    if (mounted) {
      state = const SettingsState(
        preferencesLoading: true,
        preferencesAvailable: false,
      );
    }
  }

  void _apply(PresentationPreferences preferences, {String? message}) {
    state = state.copyWith(
      leftHandedMode: preferences.leftHandedMode,
      horizontalSwipeEnabled: preferences.horizontalSwipeEnabled,
      preferencesVersion: preferences.version,
      preferencesLoading: false,
      preferencesSaving: false,
      preferencesAvailable: true,
      preferencesRetryPending: false,
      preferencesMessage: message,
    );
  }

  Future<void> reload({String? message}) async {
    if (_load == null) return;
    final operation = ++_operation;
    _pending = null;
    _pendingKey = null;
    state = state.copyWith(
      preferencesLoading: true,
      preferencesSaving: false,
      preferencesAvailable: false,
      preferencesRetryPending: false,
    );
    try {
      final preferences = await _load();
      if (!_current(operation)) return;
      if (preferences == null) {
        state = state.copyWith(
          preferencesLoading: false,
          preferencesMessage: 'Account preferences are not available yet.',
        );
      } else {
        _apply(preferences, message: message);
      }
    } catch (_) {
      if (_current(operation)) {
        state = state.copyWith(
          preferencesLoading: false,
          preferencesMessage:
              'Unable to load saved preferences. Retry to continue.',
        );
      }
    }
  }

  Future<void> savePreferences({
    required bool leftHandedMode,
    required bool horizontalSwipeEnabled,
  }) async {
    if (_save == null ||
        !state.preferencesAvailable ||
        state.preferencesSaving ||
        state.preferencesLoading) {
      return;
    }
    final operation = ++_operation;
    _pending ??= PresentationPreferences(
      leftHandedMode: leftHandedMode,
      horizontalSwipeEnabled: horizontalSwipeEnabled,
      version: state.preferencesVersion,
    );
    _pendingKey ??= const Uuid().v4();
    state = state.copyWith(preferencesSaving: true);
    try {
      final saved = await _save(_pending!, _pendingKey!);
      if (!_current(operation)) return;
      _pending = null;
      _pendingKey = null;
      _apply(
        saved,
        message: state.preferencesOwnerId == null
            ? 'Saved on this device for guest use.'
            : 'Saved to your account.',
      );
      if (state.preferencesOwnerId != null) {
        await reload(message: 'Saved to your account.');
      }
    } on DioException catch (error) {
      if (!_current(operation)) return;
      final code = error.response?.data is Map
          ? (error.response!.data as Map)['error']
          : null;
      if (code == 'presentation_preferences_conflict') {
        await reload(
          message:
              'Preferences changed on another device. Review the saved choices before applying your changes again.',
        );
      } else if (code == 'presentation_preferences_unavailable') {
        _pending = null;
        _pendingKey = null;
        state = state.copyWith(
          preferencesSaving: false,
          preferencesAvailable: false,
          preferencesRetryPending: false,
          preferencesMessage: 'Account preferences are not available yet.',
        );
      } else {
        _failedSave();
      }
    } catch (_) {
      if (_current(operation)) _failedSave();
    }
  }

  void _failedSave() {
    state = state.copyWith(
      preferencesSaving: false,
      preferencesRetryPending: true,
      preferencesMessage:
          'Save could not be confirmed. Retry the same save or reload saved choices.',
    );
  }

  Future<void> resetGuestPreferences() async {
    if (state.preferencesOwnerId != null ||
        state.preferencesLoading ||
        state.preferencesSaving ||
        _save == null) {
      return;
    }
    _pending = null;
    _pendingKey = null;
    state = state.copyWith(
      preferencesAvailable: true,
      preferencesRetryPending: false,
    );
    await savePreferences(leftHandedMode: false, horizontalSwipeEnabled: true);
  }

  @override
  void dispose() {
    _operation++;
    _pending = null;
    super.dispose();
  }

  void toggleLeftHanded() {
    state = state.copyWith(leftHandedMode: !state.leftHandedMode);
  }

  void toggleSwipeEnabled() {
    state = state.copyWith(
      horizontalSwipeEnabled: !state.horizontalSwipeEnabled,
    );
  }

  void toggleHaptics() {
    state = state.copyWith(hapticsEnabled: !state.hapticsEnabled);
  }

  void setTrustPassportVisibility(String visibility) {
    state = state.copyWith(trustPassportVisibility: visibility);
  }
}

final settingsProvider =
    StateNotifierProvider<SettingsController, SettingsState>((ref) {
      ref.watch(authSessionRevisionProvider);
      final user = ref.watch(currentUserProvider);
      final storage = ref.watch(guestPreferencesStorageProvider);
      final cancellation = CancelToken();
      final controller = SettingsController(
        ownerId: user?.id,
        load: () async {
          if (user == null) return storage.load();
          ref.invalidate(ownerProfileProvider);
          final subscription = ref.listen(ownerProfileProvider, (_, _) {});
          try {
            final profile = await ref.read(ownerProfileProvider.future);
            if (profile.user.id != user.id) throw StateError('Owner mismatch');
            return profile.presentationPreferences;
          } finally {
            subscription.close();
          }
        },
        save: (preferences, key) async {
          if (user == null) {
            await storage.save(preferences);
            return preferences;
          }
          final token = await Future.any<String?>([
            ref.read(jwtProvider.future),
            cancellation.whenCancel.then<String?>((error) => throw error),
          ]);
          if (cancellation.isCancelled) throw cancellation.cancelError!;
          if (token == null || token.isEmpty) {
            throw StateError('Session expired');
          }
          final profile = await ref
              .read(profilePreferencesServiceProvider)
              .updatePresentationPreferences(
                accessToken: token,
                preferences: preferences,
                idempotencyKey: key,
                cancelToken: cancellation,
              );
          if (profile.user.id != user.id ||
              profile.presentationPreferences == null) {
            throw const FormatException('Invalid saved owner preferences');
          }
          return profile.presentationPreferences!;
        },
      );
      final stop = ref
          .read(authSessionRevisionProvider.notifier)
          .cancelOnChange(() {
            cancellation.cancel();
            controller.clearSession();
          });
      ref.onDispose(stop);
      ref.onDispose(cancellation.cancel);
      return controller;
    });

final leftHandedModeProvider = Provider<bool>(
  (ref) => ref.watch(settingsProvider).leftHandedMode,
);

final horizontalSwipeEnabledProvider = Provider<bool>(
  (ref) => ref.watch(settingsProvider).horizontalSwipeEnabled,
);

final trustPassportVisibilityProvider = Provider<String>(
  (ref) => ref.watch(settingsProvider).trustPassportVisibility,
);

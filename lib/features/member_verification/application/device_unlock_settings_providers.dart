// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/application/draft_device_unlock_controller.dart';

final deviceUnlockSettingsEnabledProvider = Provider<bool>(
  (_) => const bool.fromEnvironment(
    'MEMBER_DEVICE_UNLOCK_SETTINGS_ENABLED',
    defaultValue: false,
  ),
);

final deviceUnlockPreferencesStoreProvider =
    Provider<DeviceUnlockPreferencesStore>(
      (_) => const SecureDeviceUnlockPreferencesStore(),
    );

final deviceUnlockAuthenticatorProvider =
    Provider.autoDispose<DeviceUnlockAuthenticator>(
      (ref) => NativeDeviceUnlockAuthenticator(
        enabled: ref.watch(deviceUnlockSettingsEnabledProvider),
      ),
    );

final deviceUnlockSettingsProvider = StateNotifierProvider.autoDispose
    .family<DraftDeviceUnlockController, DraftDeviceUnlockState, String>((
      ref,
      accountId,
    ) {
      ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final revision = session.revision;
      final enabled =
          ref.watch(deviceUnlockSettingsEnabledProvider) &&
          ref.watch(currentUserProvider)?.id == accountId;
      final controller = DraftDeviceUnlockController(
        accountId: accountId,
        store: ref.watch(deviceUnlockPreferencesStoreProvider),
        authenticator: ref.watch(deviceUnlockAuthenticatorProvider),
        enabled: enabled,
      );
      final stop = session.cancelOnChange(controller.clearSession);
      ref.onDispose(stop);
      final lifecycle = AppLifecycleListener(
        onStateChange: (state) {
          if (state == AppLifecycleState.inactive &&
              controller.isAuthenticating) {
            return;
          }
          controller.onLifecycleChanged(state);
        },
      );
      ref.onDispose(lifecycle.dispose);
      scheduleMicrotask(() {
        if (controller.mounted && revision == session.revision) {
          unawaited(controller.initialize());
        }
      });
      return controller;
    });

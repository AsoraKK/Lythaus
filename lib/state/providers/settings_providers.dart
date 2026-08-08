// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/data/mock/mock_settings.dart';
import 'package:lythaus/state/models/settings.dart';

class SettingsController extends StateNotifier<SettingsState> {
  SettingsController() : super(defaultSettings);

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
    StateNotifierProvider<SettingsController, SettingsState>(
      (ref) => SettingsController(),
    );

final leftHandedModeProvider = Provider<bool>(
  (ref) => ref.watch(settingsProvider).leftHandedMode,
);

final horizontalSwipeEnabledProvider = Provider<bool>(
  (ref) => ref.watch(settingsProvider).horizontalSwipeEnabled,
);

final trustPassportVisibilityProvider = Provider<String>(
  (ref) => ref.watch(settingsProvider).trustPassportVisibility,
);

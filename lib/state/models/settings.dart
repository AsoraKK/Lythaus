// ignore_for_file: public_member_api_docs

class SettingsState {
  final bool leftHandedMode;
  final bool horizontalSwipeEnabled;
  final bool hapticsEnabled;
  final String trustPassportVisibility;
  final bool preferencesLoading;
  final bool preferencesSaving;
  final bool preferencesAvailable;
  final bool preferencesRetryPending;
  final String? preferencesMessage;
  final int preferencesVersion;
  final String? preferencesOwnerId;

  const SettingsState({
    this.leftHandedMode = false,
    this.horizontalSwipeEnabled = true,
    this.hapticsEnabled = true,
    this.trustPassportVisibility = 'public_minimal',
    this.preferencesLoading = false,
    this.preferencesSaving = false,
    this.preferencesAvailable = true,
    this.preferencesRetryPending = false,
    this.preferencesMessage,
    this.preferencesVersion = 1,
    this.preferencesOwnerId,
  });

  SettingsState copyWith({
    bool? leftHandedMode,
    bool? horizontalSwipeEnabled,
    bool? hapticsEnabled,
    String? trustPassportVisibility,
    bool? preferencesLoading,
    bool? preferencesSaving,
    bool? preferencesAvailable,
    bool? preferencesRetryPending,
    String? preferencesMessage,
    int? preferencesVersion,
  }) {
    return SettingsState(
      leftHandedMode: leftHandedMode ?? this.leftHandedMode,
      horizontalSwipeEnabled:
          horizontalSwipeEnabled ?? this.horizontalSwipeEnabled,
      hapticsEnabled: hapticsEnabled ?? this.hapticsEnabled,
      trustPassportVisibility:
          trustPassportVisibility ?? this.trustPassportVisibility,
      preferencesLoading: preferencesLoading ?? this.preferencesLoading,
      preferencesSaving: preferencesSaving ?? this.preferencesSaving,
      preferencesAvailable: preferencesAvailable ?? this.preferencesAvailable,
      preferencesRetryPending:
          preferencesRetryPending ?? this.preferencesRetryPending,
      preferencesMessage: preferencesMessage,
      preferencesVersion: preferencesVersion ?? this.preferencesVersion,
      preferencesOwnerId: preferencesOwnerId,
    );
  }
}

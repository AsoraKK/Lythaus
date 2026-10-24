// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_settings_providers.dart';
import 'package:lythaus/features/member_verification/application/draft_device_unlock_controller.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

class DeviceUnlockSettingsCard extends ConsumerWidget {
  const DeviceUnlockSettingsCard({required this.accountId, super.key});
  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(deviceUnlockSettingsEnabledProvider)) {
      return const SizedBox.shrink();
    }
    final state = ref.watch(deviceUnlockSettingsProvider(accountId));
    final controller = ref.read(
      deviceUnlockSettingsProvider(accountId).notifier,
    );
    final busy =
        state.saving ||
        state.status == DraftDeviceUnlockStatus.loading ||
        state.status == DraftDeviceUnlockStatus.authenticating;
    final available = state.availability == DeviceUnlockAvailability.available;
    final message = switch (state.status) {
      DraftDeviceUnlockStatus.loading => 'Loading this device’s saved choice…',
      DraftDeviceUnlockStatus.authenticating =>
        'Confirm with your device credentials. You can cancel.',
      DraftDeviceUnlockStatus.cancelled =>
        'Cancelled. Your saved choice has not changed.',
      DraftDeviceUnlockStatus.lockedOut =>
        'Device authentication is locked out. Use the OS passcode fallback or try again later. Off remains available.',
      DraftDeviceUnlockStatus.unavailable =>
        'Device authentication is unavailable. Web and unsupported devices cannot enable this preference. Off remains available.',
      DraftDeviceUnlockStatus.storageUnavailable =>
        'The saved choice could not be confirmed. Retry before relying on it.',
      _ =>
        !available
            ? 'OS authentication is unavailable here. Web and unsupported devices cannot enable this preference. Off remains available.'
            : state.saving
            ? 'Saving on this device…'
            : 'This device’s saved or default choice is shown.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Device unlock preference',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const Text(
          'Implementation preview: app-wide protection is inactive pending device acceptance. Browsing and session refresh continue.',
        ),
        const Text(
          'Use OS-managed biometrics, password, passcode or pattern. No new Lythaus PIN is created.',
        ),
        const Text('Unlock frequency'),
        DropdownButton<DeviceUnlockPreference>(
          value: state.preference,
          isExpanded: true,
          items: [
            for (final preference in DeviceUnlockPreference.values)
              DropdownMenuItem(
                value: preference,
                enabled: available || preference == DeviceUnlockPreference.off,
                child: Text(preference.label),
              ),
          ],
          onChanged: busy
              ? null
              : (choice) {
                  if (choice != null) {
                    controller.confirmAndSavePreference(choice);
                  }
                },
        ),
        Semantics(liveRegion: true, child: Text(message)),
        if (state.status == DraftDeviceUnlockStatus.authenticating)
          TextButton(
            onPressed: controller.cancel,
            child: const Text('Cancel device confirmation'),
          ),
        if (state.status == DraftDeviceUnlockStatus.storageUnavailable ||
            !available)
          TextButton(
            onPressed: busy ? null : controller.reloadPreference,
            child: const Text('Reload choice and device support'),
          ),
        const Text(
          'Monthly eligibility mapping is pending. All qualifying protection choices share the same benefit, with a total allowance of 24 hours off per calendar month. Switching does not reset that allowance. More than 24 hours forfeits only that month’s security benefit. Genuine server authentication and verified coverage are required; local biometric success is not that evidence. Disabling does not deduct other reputation.',
        ),
      ],
    );
  }
}

// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_settings_providers.dart';
import 'package:lythaus/features/member_verification/application/draft_device_unlock_controller.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

final deviceAppLockEnabledProvider = Provider<bool>(
  (_) => const bool.fromEnvironment(
    'MEMBER_DEVICE_APP_LOCK_ENABLED',
    defaultValue: false,
  ),
);

/// Composed above the router so dialogs, deep links and nested routes cannot
/// expose the signed-in surface while local protection is locked.
class DeviceAppLock extends ConsumerWidget {
  const DeviceAppLock({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(deviceAppLockEnabledProvider) ||
        !ref.watch(deviceUnlockSettingsEnabledProvider)) {
      return child;
    }
    return _EnabledDeviceAppLock(child: child);
  }
}

class _EnabledDeviceAppLock extends ConsumerStatefulWidget {
  const _EnabledDeviceAppLock({required this.child});
  final Widget child;
  @override
  ConsumerState<_EnabledDeviceAppLock> createState() => _DeviceAppLockState();
}

class _DeviceAppLockState extends ConsumerState<_EnabledDeviceAppLock> {
  late final AppLifecycleListener _lifecycle;
  bool _away = false;
  bool _leaving = false;
  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onStateChange: (state) {
        if (mounted) setState(() => _away = state != AppLifecycleState.resumed);
      },
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _browseAsGuest() async {
    if (_leaving) return;
    setState(() => _leaving = true);
    try {
      await ref.read(authStateProvider.notifier).continueAsGuest();
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(currentUserProvider)?.id;
    if (account == null) return widget.child;
    final state = ref.watch(deviceUnlockSettingsProvider(account));
    final controller = ref.read(deviceUnlockSettingsProvider(account).notifier);
    final loading =
        state.status == DraftDeviceUnlockStatus.inactive ||
        state.status == DraftDeviceUnlockStatus.loading;
    final storageFailure =
        state.status == DraftDeviceUnlockStatus.storageUnavailable;
    final protected = state.preference != DeviceUnlockPreference.off;
    final locked =
        loading ||
        storageFailure ||
        (protected &&
            (_away || state.status != DraftDeviceUnlockStatus.unlocked));
    final authenticating =
        state.status == DraftDeviceUnlockStatus.authenticating;
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeFocus(
          excluding: locked,
          child: ExcludeSemantics(
            excluding: locked,
            child: Offstage(
              offstage: locked,
              child: TickerMode(enabled: !locked, child: widget.child),
            ),
          ),
        ),
        if (locked)
          Material(
            child: SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.lock_outline,
                        semanticLabel: 'Device unlock required',
                      ),
                      Text(
                        loading
                            ? 'Loading device protection…'
                            : 'Unlock Lythaus',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Semantics(
                        liveRegion: true,
                        child: Text(switch (state.status) {
                          DraftDeviceUnlockStatus.cancelled =>
                            'Unlock cancelled. Your account remains hidden.',
                          DraftDeviceUnlockStatus.lockedOut =>
                            'Device authentication is locked out. Use your OS passcode fallback or try again later.',
                          DraftDeviceUnlockStatus.unavailable =>
                            'Device authentication is unavailable. Restore your device credentials in OS settings, or sign out here and browse as a guest. Account password recovery is available at sign-in; it does not reset this device’s saved lock.',
                          DraftDeviceUnlockStatus.storageUnavailable =>
                            'Your saved protection could not be read. Retry or sign out here to browse as a guest.',
                          _ =>
                            'Use your OS-managed biometric, password, passcode or pattern. This does not verify a sensitive account action.',
                        }),
                      ),
                      if (loading || authenticating)
                        const CircularProgressIndicator(),
                      if (!loading && !storageFailure && !authenticating)
                        FilledButton(
                          onPressed:
                              _away ||
                                  state.availability !=
                                      DeviceUnlockAvailability.available
                              ? null
                              : controller.unlock,
                          child: const Text('Unlock with device credentials'),
                        ),
                      if (authenticating)
                        TextButton(
                          onPressed: controller.cancel,
                          child: const Text('Cancel device unlock'),
                        ),
                      if (storageFailure ||
                          state.status == DraftDeviceUnlockStatus.unavailable)
                        TextButton(
                          onPressed: controller.reloadPreference,
                          child: const Text('Retry device support'),
                        ),
                      TextButton(
                        onPressed: _leaving ? null : _browseAsGuest,
                        child: const Text('Sign out here and browse as guest'),
                      ),
                      const Text(
                        'Your saved choice is retained. Recovery or disabling protection does not deduct other reputation.',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

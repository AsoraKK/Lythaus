// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
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
  const DeviceAppLock({
    required this.child,
    required this.resetPrivateNavigation,
    super.key,
  });
  final Widget child;
  final Future<void> Function() resetPrivateNavigation;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(deviceAppLockEnabledProvider) ||
        !ref.watch(deviceUnlockSettingsEnabledProvider)) {
      return child;
    }
    return _EnabledDeviceAppLock(
      resetPrivateNavigation: resetPrivateNavigation,
      child: child,
    );
  }
}

class _EnabledDeviceAppLock extends ConsumerStatefulWidget {
  const _EnabledDeviceAppLock({
    required this.child,
    required this.resetPrivateNavigation,
  });
  final Widget child;
  final Future<void> Function() resetPrivateNavigation;
  @override
  ConsumerState<_EnabledDeviceAppLock> createState() => _DeviceAppLockState();
}

class _DeviceAppLockState extends ConsumerState<_EnabledDeviceAppLock> {
  late final AppLifecycleListener _lifecycle;
  bool _away = false;
  bool _leaving = false;
  late final void Function() _stopAuth;
  String? _observedAccount;
  int _recoveryRevision = 0;
  int _requestedReset = 0, _completedReset = 0;
  bool _navigationFailed = false;
  Future<void> _navigationWork = Future.value();
  bool get _navigationPending => _requestedReset != _completedReset;
  @override
  void initState() {
    super.initState();
    // Observe the source synchronously, including A -> null -> A within one
    // frame. Derived owner providers may coalesce that private boundary.
    _stopAuth = ref.read(authStateProvider.notifier).addListener((value) {
      final previous = _observedAccount;
      final next = value.valueOrNull?.id;
      _observedAccount = next;
      if (_leaving && next != null) {
        _recoveryRevision++;
        setState(() => _leaving = false);
      }
      if (previous != null && previous != next) {
        unawaited(_clearPrivateNavigation());
      }
    });
    _lifecycle = AppLifecycleListener(
      onStateChange: (state) {
        if (mounted) setState(() => _away = state != AppLifecycleState.resumed);
      },
    );
  }

  @override
  void dispose() {
    _stopAuth();
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _browseAsGuest() async {
    if (_leaving) return;
    final operation = ++_recoveryRevision;
    final session = ref.read(authSessionRevisionProvider.notifier);
    final revision = session.revision;
    setState(() => _leaving = true);
    try {
      if (!await _clearPrivateNavigation() ||
          !mounted ||
          operation != _recoveryRevision ||
          session.revision != revision) {
        return;
      }
      await ref.read(authStateProvider.notifier).continueAsGuest();
      // The synchronous owner-exit listener queues another reset. Keep the
      // shield until the replacement router has disposed all prior overlays.
      await _navigationWork;
    } finally {
      if (mounted && operation == _recoveryRevision) {
        setState(() => _leaving = false);
      }
    }
  }

  Future<bool> _clearPrivateNavigation() {
    final request = ++_requestedReset;
    setState(() => _navigationFailed = false);
    final work = _navigationWork.then((_) async {
      if (!mounted) return false;
      var cleared = false;
      try {
        await widget.resetPrivateNavigation();
        cleared = true;
      } catch (_) {
        // Fail closed without logging private route or dialog contents.
      }
      if (mounted) {
        setState(() {
          _completedReset = request;
          _navigationFailed = !cleared;
        });
      }
      return cleared;
    });
    _navigationWork = work.then<void>((_) {});
    return work;
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(currentUserProvider)?.id;
    final boundaryLocked = _leaving || _navigationPending || _navigationFailed;
    if (account == null && !boundaryLocked) return widget.child;
    final state = account == null
        ? const DraftDeviceUnlockState(
            DraftDeviceUnlockStatus.unlocked,
            DeviceUnlockPreference.off,
          )
        : ref.watch(deviceUnlockSettingsProvider(account));
    final controller = account == null
        ? null
        : ref.read(deviceUnlockSettingsProvider(account).notifier);
    final loading =
        _leaving ||
        _navigationPending ||
        state.status == DraftDeviceUnlockStatus.inactive ||
        state.status == DraftDeviceUnlockStatus.loading;
    final storageFailure =
        state.status == DraftDeviceUnlockStatus.storageUnavailable;
    final protected = state.preference != DeviceUnlockPreference.off;
    final locked =
        boundaryLocked ||
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
                        _navigationFailed
                            ? 'Private navigation could not be cleared'
                            : boundaryLocked
                            ? 'Clearing private navigation…'
                            : loading
                            ? 'Loading device protection…'
                            : 'Unlock Lythaus',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          _navigationFailed
                              ? 'Retry clearing the previous account view before browsing. Your device preference is unchanged.'
                              : boundaryLocked
                              ? 'Clearing the previous account view before continuing.'
                              : switch (state.status) {
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
                                },
                        ),
                      ),
                      if (loading || authenticating)
                        const CircularProgressIndicator(),
                      if (!boundaryLocked &&
                          !loading &&
                          !storageFailure &&
                          !authenticating)
                        FilledButton(
                          onPressed:
                              _away ||
                                  state.availability !=
                                      DeviceUnlockAvailability.available
                              ? null
                              : controller?.unlock,
                          child: const Text('Unlock with device credentials'),
                        ),
                      if (!boundaryLocked && authenticating)
                        TextButton(
                          onPressed: controller?.cancel,
                          child: const Text('Cancel device unlock'),
                        ),
                      if (!boundaryLocked &&
                          (storageFailure ||
                              state.status ==
                                  DraftDeviceUnlockStatus.unavailable))
                        TextButton(
                          onPressed: controller?.reloadPreference,
                          child: const Text('Retry device support'),
                        ),
                      if (_navigationFailed)
                        TextButton(
                          onPressed: _clearPrivateNavigation,
                          child: const Text(
                            'Retry clearing private navigation',
                          ),
                        ),
                      TextButton(
                        onPressed:
                            _leaving || _navigationPending || account == null
                            ? null
                            : _browseAsGuest,
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

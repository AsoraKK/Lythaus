// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/error_codes.dart' as errors;
import 'package:local_auth/local_auth.dart';

enum DeviceUnlockAvailability { available, disabled, unsupported, unavailable }

enum DeviceUnlockResult { unlocked, cancelled, lockedOut, unavailable }

abstract interface class DeviceUnlockAuthenticator {
  Future<DeviceUnlockAvailability> availability();
  Future<DeviceUnlockResult> unlock();
  Future<void> cancel();
}

class NativeDeviceUnlockAuthenticator implements DeviceUnlockAuthenticator {
  NativeDeviceUnlockAuthenticator({
    this.enabled = false,
    LocalAuthentication? localAuth,
    bool isWeb = kIsWeb,
  }) : _localAuth = localAuth ?? LocalAuthentication(),
       _isWeb = isWeb;

  final bool enabled;
  final LocalAuthentication _localAuth;
  final bool _isWeb;
  int _revision = 0;

  @override
  Future<DeviceUnlockAvailability> availability() async {
    if (!enabled) return DeviceUnlockAvailability.disabled;
    if (_isWeb) return DeviceUnlockAvailability.unsupported;
    try {
      return await _localAuth.isDeviceSupported()
          ? DeviceUnlockAvailability.available
          : DeviceUnlockAvailability.unavailable;
    } catch (_) {
      return DeviceUnlockAvailability.unavailable;
    }
  }

  @override
  Future<DeviceUnlockResult> unlock() async {
    final revision = ++_revision;
    if (await availability() != DeviceUnlockAvailability.available ||
        revision != _revision) {
      return DeviceUnlockResult.unavailable;
    }
    try {
      final unlocked = await _localAuth.authenticate(
        localizedReason: 'Unlock Lythaus on this device',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: false,
          useErrorDialogs: false,
        ),
      );
      if (revision != _revision) return DeviceUnlockResult.cancelled;
      return unlocked
          ? DeviceUnlockResult.unlocked
          : DeviceUnlockResult.cancelled;
    } on PlatformException catch (error) {
      return error.code == errors.lockedOut ||
              error.code == errors.permanentlyLockedOut
          ? DeviceUnlockResult.lockedOut
          : DeviceUnlockResult.unavailable;
    } catch (_) {
      return DeviceUnlockResult.unavailable;
    }
  }

  @override
  Future<void> cancel() async {
    _revision++;
    if (!enabled || _isWeb) return;
    try {
      await _localAuth.stopAuthentication();
    } catch (_) {
      return;
    }
  }
}

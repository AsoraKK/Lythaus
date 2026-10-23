import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/application/draft_device_unlock_controller.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

class _Authenticator implements DeviceUnlockAuthenticator {
  DeviceUnlockAvailability supported = DeviceUnlockAvailability.available;
  DeviceUnlockResult result = DeviceUnlockResult.unlocked;
  Completer<DeviceUnlockResult>? pending;
  int probes = 0;
  int prompts = 0;
  int cancellations = 0;

  @override
  Future<DeviceUnlockAvailability> availability() async {
    probes++;
    return supported;
  }

  @override
  Future<DeviceUnlockResult> unlock() async {
    prompts++;
    return pending?.future ?? result;
  }

  @override
  Future<void> cancel() async => cancellations++;
}

class _Store implements DeviceUnlockPreferencesStore {
  final values = <String, DeviceUnlockPreference>{};
  bool fail = false;
  int calls = 0;
  Completer<DeviceUnlockPreference>? pending;

  @override
  Future<DeviceUnlockPreference> load(String accountId) async {
    calls++;
    if (fail) throw StateError('storage unavailable');
    return pending?.future ?? values[accountId] ?? DeviceUnlockPreference.off;
  }

  @override
  Future<void> save(String accountId, DeviceUnlockPreference preference) async {
    calls++;
    if (fail) throw StateError('storage unavailable');
    values[accountId] = preference;
  }
}

class _Harness {
  _Harness({
    DeviceUnlockPreference preference = DeviceUnlockPreference.afterFiveMinutes,
    bool enabled = true,
  }) {
    store.values['a'] = preference;
    controller = DraftDeviceUnlockController(
      accountId: 'a',
      store: store,
      authenticator: authenticator,
      enabled: enabled,
      elapsed: () => elapsed,
      wallTime: () => wallTime,
    );
  }

  final store = _Store();
  final authenticator = _Authenticator();
  Duration elapsed = Duration.zero;
  DateTime wallTime = DateTime.utc(2026, 10, 23);
  late final DraftDeviceUnlockController controller;
  DraftDeviceUnlockStatus get status => controller.state.status;
  Future<void> open() async {
    await controller.initialize();
    await controller.unlock();
  }

  void away(Duration duration) {
    controller.onLifecycleChanged(AppLifecycleState.inactive);
    elapsed += duration;
    wallTime = wallTime.add(duration);
    controller.onLifecycleChanged(AppLifecycleState.resumed);
  }
}

class _LocalAuth extends LocalAuthentication {
  bool supported = true;
  bool result = true;
  String? failure;
  Completer<bool>? supportPending;
  Completer<bool>? promptPending;
  AuthenticationOptions? options;
  int probes = 0;
  int prompts = 0;
  int cancellations = 0;

  @override
  Future<bool> isDeviceSupported() async {
    probes++;
    return supportPending?.future ?? supported;
  }

  @override
  Future<bool> authenticate({
    required String localizedReason,
    Iterable<Object?> authMessages = const [],
    AuthenticationOptions options = const AuthenticationOptions(),
  }) async {
    prompts++;
    this.options = options;
    if (failure != null) throw PlatformException(code: failure!);
    return promptPending?.future ?? result;
  }

  @override
  Future<bool> stopAuthentication() async {
    cancellations++;
    return true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('default controller and native adapter perform no work', () async {
    final h = _Harness(enabled: false);
    addTearDown(h.controller.dispose);
    await h.controller.initialize();
    await h.controller.savePreference(DeviceUnlockPreference.everyReopen);
    await h.controller.unlock();
    h.away(const Duration(days: 1));
    await h.controller.cancel();
    expect(h.status, DraftDeviceUnlockStatus.inactive);
    expect(h.store.calls, 0);
    expect(h.authenticator.probes + h.authenticator.prompts, 0);
    final local = _LocalAuth();
    final adapter = NativeDeviceUnlockAuthenticator(localAuth: local);
    expect(await adapter.availability(), DeviceUnlockAvailability.disabled);
    expect(await adapter.unlock(), DeviceUnlockResult.unavailable);
    await adapter.cancel();
    expect(local.probes + local.prompts + local.cancellations, 0);
  });

  test(
    'versioned per-device preferences survive reconstruction and isolate accounts',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'unchanged-access',
        'refreshToken': 'unchanged-refresh',
        'userData': 'unchanged-user',
      });
      const store = SecureDeviceUnlockPreferencesStore();
      expect(await store.load('a'), DeviceUnlockPreference.off);
      for (final choice in DeviceUnlockPreference.values) {
        await store.save('a', choice);
        expect(
          await const SecureDeviceUnlockPreferencesStore().load('a'),
          choice,
        );
        expect(await store.load('b'), DeviceUnlockPreference.off);
      }
      await store.save('a', DeviceUnlockPreference.everyReopen);
      await store.save('b', DeviceUnlockPreference.afterFifteenMinutes);
      expect(await store.load('a'), DeviceUnlockPreference.everyReopen);
      expect(await store.load('b'), DeviceUnlockPreference.afterFifteenMinutes);
      final values = await const FlutterSecureStorage().readAll();
      expect(values['jwt'], 'unchanged-access');
      expect(values['refreshToken'], 'unchanged-refresh');
      expect(values['userData'], 'unchanged-user');
      expect(values.length, 5);
      expect(
        () => SecureDeviceUnlockPreferencesStore.keyForAccount(' '),
        throwsArgumentError,
      );
    },
  );

  test('unknown or corrupt stored choices never silently become Off', () async {
    for (final bad in [
      'not-json',
      '{"version":2,"preference":"off"}',
      '{"version":1,"preference":"future-choice"}',
      'null',
    ]) {
      FlutterSecureStorage.setMockInitialValues({
        SecureDeviceUnlockPreferencesStore.keyForAccount('a'): bad,
      });
      await expectLater(
        const SecureDeviceUnlockPreferencesStore().load('a'),
        throwsFormatException,
      );
    }
  });

  for (final preference in DeviceUnlockPreference.values) {
    test('${preference.value}: cold open and exact away boundary', () async {
      final h = _Harness(preference: preference);
      addTearDown(h.controller.dispose);
      await h.controller.initialize();
      expect(
        h.status,
        preference == DeviceUnlockPreference.off
            ? DraftDeviceUnlockStatus.unlocked
            : DraftDeviceUnlockStatus.locked,
      );
      await h.controller.unlock();
      expect(h.status, DraftDeviceUnlockStatus.unlocked);
      final interval = preference.awayInterval;
      if (interval != null && interval > Duration.zero) {
        h.away(interval - const Duration(microseconds: 1));
        expect(h.status, DraftDeviceUnlockStatus.unlocked);
      }
      h.away(interval ?? const Duration(days: 300));
      expect(
        h.status,
        interval == null
            ? DraftDeviceUnlockStatus.unlocked
            : DraftDeviceUnlockStatus.locked,
      );
      expect(h.authenticator.prompts, interval == null ? 0 : 1);
    });
  }

  test(
    'inactive/hidden/paused events retain the first away timestamp',
    () async {
      final h = _Harness();
      addTearDown(h.controller.dispose);
      await h.open();
      h.controller.onLifecycleChanged(AppLifecycleState.inactive);
      h.elapsed += const Duration(minutes: 4);
      h.controller.onLifecycleChanged(AppLifecycleState.hidden);
      h.controller.onLifecycleChanged(AppLifecycleState.paused);
      h.elapsed += const Duration(minutes: 1);
      h.controller.onLifecycleChanged(AppLifecycleState.resumed);
      expect(h.status, DraftDeviceUnlockStatus.locked);
      expect(h.authenticator.prompts, 1);
    },
  );

  test('clock jumps cannot extend grace; monotonic reset locks', () async {
    final h = _Harness();
    addTearDown(h.controller.dispose);
    await h.open();
    h.away(const Duration(minutes: 1));
    expect(h.status, DraftDeviceUnlockStatus.unlocked);
    h.controller.onLifecycleChanged(AppLifecycleState.paused);
    h.wallTime = DateTime.utc(2000);
    h.elapsed += const Duration(minutes: 1);
    h.controller.onLifecycleChanged(AppLifecycleState.resumed);
    expect(h.status, DraftDeviceUnlockStatus.locked);
    await h.controller.unlock();
    h.controller.onLifecycleChanged(AppLifecycleState.paused);
    h.wallTime = DateTime.utc(2099);
    h.controller.onLifecycleChanged(AppLifecycleState.resumed);
    expect(h.status, DraftDeviceUnlockStatus.locked);
    await h.controller.unlock();
    h.controller.onLifecycleChanged(AppLifecycleState.paused);
    h.elapsed += const Duration(minutes: 5);
    h.controller.onLifecycleChanged(AppLifecycleState.resumed);
    expect(h.status, DraftDeviceUnlockStatus.locked);
    await h.controller.unlock();
    h.controller.onLifecycleChanged(AppLifecycleState.paused);
    h.elapsed = Duration.zero;
    h.controller.onLifecycleChanged(AppLifecycleState.resumed);
    expect(h.status, DraftDeviceUnlockStatus.locked);
  });

  for (final result in [
    DeviceUnlockResult.cancelled,
    DeviceUnlockResult.lockedOut,
    DeviceUnlockResult.unavailable,
  ]) {
    test(
      '$result remains locked; explicit OS retry can recover offline',
      () async {
        final h = _Harness();
        addTearDown(h.controller.dispose);
        h.authenticator.result = result;
        await h.open();
        expect(h.status, isNot(DraftDeviceUnlockStatus.unlocked));
        h.authenticator.result = DeviceUnlockResult.unlocked;
        await h.controller.unlock();
        expect(h.status, DraftDeviceUnlockStatus.unlocked);
      },
    );
  }

  for (final interruption in ['cancel', 'background', 'dispose']) {
    test(
      'late success after $interruption cannot unlock another session',
      () async {
        final h = _Harness();
        h.authenticator.pending = Completer<DeviceUnlockResult>();
        await h.controller.initialize();
        final attempt = h.controller.unlock();
        expect(h.status, DraftDeviceUnlockStatus.authenticating);
        await h.controller.unlock();
        expect(h.authenticator.prompts, 1);
        if (interruption == 'cancel') await h.controller.cancel();
        if (interruption == 'background') {
          h.controller.onLifecycleChanged(AppLifecycleState.paused);
          h.controller.onLifecycleChanged(AppLifecycleState.resumed);
        }
        if (interruption == 'dispose') h.controller.dispose();
        final replacement = DraftDeviceUnlockController(
          accountId: 'b',
          store: h.store,
          authenticator: _Authenticator(),
          enabled: true,
        );
        addTearDown(replacement.dispose);
        await replacement.initialize();
        await replacement.savePreference(DeviceUnlockPreference.everyReopen);
        h.authenticator.pending!.complete(DeviceUnlockResult.unlocked);
        await attempt;
        if (interruption != 'dispose') {
          expect(h.status, isNot(DraftDeviceUnlockStatus.unlocked));
          h.controller.dispose();
        }
        expect(replacement.state.status, DraftDeviceUnlockStatus.locked);
        expect(h.authenticator.cancellations, 1);
      },
    );
  }

  test(
    'late hydration from a disposed account cannot change replacement choices',
    () async {
      final store = _Store()..pending = Completer<DeviceUnlockPreference>();
      final old = DraftDeviceUnlockController(
        accountId: 'a',
        store: store,
        authenticator: _Authenticator(),
        enabled: true,
      );
      final load = old.initialize();
      old.dispose();
      final fresh = _Harness(preference: DeviceUnlockPreference.off);
      addTearDown(fresh.controller.dispose);
      await fresh.controller.initialize();
      store.pending!.complete(DeviceUnlockPreference.everyReopen);
      await load;
      expect(fresh.controller.state.preference, DeviceUnlockPreference.off);
      expect(fresh.status, DraftDeviceUnlockStatus.unlocked);
    },
  );

  test(
    'storage failure never reports a saved preference or unlock success',
    () async {
      final h = _Harness();
      addTearDown(h.controller.dispose);
      h.store.fail = true;
      await h.controller.initialize();
      await h.controller.unlock();
      expect(h.status, DraftDeviceUnlockStatus.storageUnavailable);
      expect(h.authenticator.prompts, 0);
      h.store.fail = false;
      await h.controller.initialize();
      h.store.fail = true;
      await h.controller.savePreference(DeviceUnlockPreference.off);
      expect(h.status, DraftDeviceUnlockStatus.storageUnavailable);
      expect(
        h.controller.state.preference,
        DeviceUnlockPreference.afterFiveMinutes,
      );
      expect(h.store.values['a'], DeviceUnlockPreference.afterFiveMinutes);
      await h.controller.unlock();
      expect(h.authenticator.prompts, 0);
    },
  );

  test(
    'unavailable device cannot save a working-looking unlock preference',
    () async {
      final h = _Harness(preference: DeviceUnlockPreference.off);
      addTearDown(h.controller.dispose);
      h.authenticator.supported = DeviceUnlockAvailability.unavailable;
      await h.controller.initialize();
      await h.controller.savePreference(DeviceUnlockPreference.everyReopen);
      expect(h.status, DraftDeviceUnlockStatus.unavailable);
      expect(h.store.values['a'], DeviceUnlockPreference.off);
    },
  );

  test('web and unsupported hardware never invoke a native prompt', () async {
    for (final web in [true, false]) {
      final local = _LocalAuth()..supported = false;
      final adapter = NativeDeviceUnlockAuthenticator(
        enabled: true,
        isWeb: web,
        localAuth: local,
      );
      expect(
        await adapter.availability(),
        web
            ? DeviceUnlockAvailability.unsupported
            : DeviceUnlockAvailability.unavailable,
      );
      expect(await adapter.unlock(), DeviceUnlockResult.unavailable);
      expect(local.prompts, 0);
      expect(local.probes, web ? 0 : 2);
    }
  });

  test(
    'native cancellation during preflight prevents a late OS prompt',
    () async {
      final local = _LocalAuth()..supportPending = Completer<bool>();
      final adapter = NativeDeviceUnlockAuthenticator(
        enabled: true,
        isWeb: false,
        localAuth: local,
      );
      final attempt = adapter.unlock();
      await adapter.cancel();
      local.supportPending!.complete(true);
      expect(await attempt, DeviceUnlockResult.unavailable);
      expect(local.prompts, 0);
    },
  );

  test(
    'native cancellation also rejects a late positive platform result',
    () async {
      final local = _LocalAuth()..promptPending = Completer<bool>();
      final adapter = NativeDeviceUnlockAuthenticator(
        enabled: true,
        isWeb: false,
        localAuth: local,
      );
      final attempt = adapter.unlock();
      await Future<void>.delayed(Duration.zero);
      expect(local.prompts, 1);
      await adapter.cancel();
      local.promptPending!.complete(true);
      expect(await attempt, DeviceUnlockResult.cancelled);
    },
  );

  test(
    'native OS fallback works without querying enrolled biometrics',
    () async {
      final local = _LocalAuth();
      final adapter = NativeDeviceUnlockAuthenticator(
        enabled: true,
        isWeb: false,
        localAuth: local,
      );
      expect(await adapter.unlock(), DeviceUnlockResult.unlocked);
      expect(local.options!.biometricOnly, isFalse);
      expect(local.options!.stickyAuth, isFalse);
      expect(local.options!.useErrorDialogs, isFalse);
      local.result = false;
      expect(await adapter.unlock(), DeviceUnlockResult.cancelled);
      for (final code in [
        'LockedOut',
        'PermanentlyLockedOut',
        'PasscodeNotSet',
        'NotAvailable',
        'NotEnrolled',
        'OtherOperatingSystem',
        'unknown',
      ]) {
        local.failure = code;
        expect(
          await adapter.unlock(),
          code.endsWith('LockedOut')
              ? DeviceUnlockResult.lockedOut
              : DeviceUnlockResult.unavailable,
        );
      }
      await adapter.cancel();
      expect(local.cancellations, 1);
    },
  );
}

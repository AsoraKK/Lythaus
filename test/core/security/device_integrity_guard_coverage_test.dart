import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/security_overrides.dart';

/// Fake device security service returning scripted state.
class _FakeDeviceSecurityService implements DeviceSecurityService {
  _FakeDeviceSecurityService({this.isRooted = false, this.isEmulator = false});

  final bool isRooted;
  final bool isEmulator;
  final bool isDebug = false;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async {
    return DeviceSecurityState(
      isRootedOrJailbroken: isRooted,
      isEmulator: isEmulator,
      isDebugBuild: isDebug,
      lastCheckedAt: DateTime(2024, 1, 1),
    );
  }

  @override
  void clearCache() {}
}

void main() {
  // ─── DeviceIntegrityDecision factories ───

  group('DeviceIntegrityDecision', () {
    test('allow() creates allowed non-blocking decision', () {
      final d = DeviceIntegrityDecision.allow();
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isFalse);
      expect(d.messageKey, isNull);
      expect(d.errorCode, isNull);
    });

    test('warnOnly() creates warn decision', () {
      final d = DeviceIntegrityDecision.warnOnly('msg.key');
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isTrue);
      expect(d.messageKey, 'msg.key');
      expect(d.errorCode, isNull);
    });

    test('block() creates blocking decision with errorCode', () {
      final d = DeviceIntegrityDecision.block('msg.blocked');
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.warnOnly, isFalse);
      expect(d.messageKey, 'msg.blocked');
      expect(d.errorCode, isNotNull);
    });
  });

  // ─── IntegrityUseCase ───

  group('IntegrityUseCase', () {
    test('all use cases valid', () {
      expect(IntegrityUseCase.values, hasLength(10));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.signIn));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.readFeed));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.postContent));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.privacyDsr));
    });
  });

  // ─── DeviceIntegrityGuard.evaluate ───

  const defaultTlsPins = TlsPinConfig(
    enabled: false,
    strictMode: false,
    spkiPinsBase64: [],
  );

  group('DeviceIntegrityGuard', () {
    test('clean device always allowed', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
        environment: Environment.production,
      );

      final d = await guard.evaluate(IntegrityUseCase.postContent);
      expect(d.allow, isTrue);
      expect(d.warnOnly, isFalse);
    });

    test('compromised device in dev env gets warn-only', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
        environment: Environment.development,
      );

      final d = await guard.evaluate(IntegrityUseCase.postContent);
      expect(d.allow, isTrue);
      expect(d.warnOnly, isTrue);
    });

    test('emulator in dev env not compromised allowed', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isEmulator: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
        environment: Environment.development,
      );

      final d = await guard.evaluate(IntegrityUseCase.postContent);
      expect(d.allow, isTrue);
    });

    test('compromised device in prod blocks write ops', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
      );

      final d = await guard.evaluate(IntegrityUseCase.postContent);
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
    });

    test('compromised device in prod allows read ops', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
      );

      final d = await guard.evaluate(IntegrityUseCase.readFeed);
      expect(d.allow, isTrue);
      expect(d.warnOnly, isTrue);
    });

    test(
      'compromised device in staging with QA override gets warn-only',
      () async {
        final guard = DeviceIntegrityGuard(
          deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
          config: const MobileSecurityConfig(
            tlsPins: defaultTlsPins,
            strictDeviceIntegrity: false,
            blockRootedDevices: true,
            allowRootedInPreviewForQa: true,
          ),
          environment: Environment.preview,
        );

        final d = await guard.evaluate(IntegrityUseCase.postContent);
        expect(d.allow, isTrue);
        expect(d.warnOnly, isTrue);
      },
    );

    test('compromised device with security override gets warn-only', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
        overrides: SecurityOverrideConfig(
          relaxDeviceIntegrity: true,
          overrideReason: 'test',
          activatedAt: DateTime.now(),
          validityDuration: const Duration(hours: 24),
        ),
      );

      final d = await guard.evaluate(IntegrityUseCase.postContent);
      expect(d.allow, isTrue);
      expect(d.warnOnly, isTrue);
    });

    test(
      'emulator in prod blocked for write ops when blockRooted true',
      () async {
        final guard = DeviceIntegrityGuard(
          deviceSecurityService: _FakeDeviceSecurityService(isEmulator: true),
          config: const MobileSecurityConfig(
            tlsPins: defaultTlsPins,
            strictDeviceIntegrity: false,
            blockRootedDevices: true,
          ),
          environment: Environment.production,
        );

        final d = await guard.evaluate(IntegrityUseCase.signIn);
        expect(d.allow, isFalse);
        expect(d.showBlockingUi, isTrue);
      },
    );

    test('each write use case is blocked on compromised prod', () async {
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: _FakeDeviceSecurityService(isRooted: true),
        config: const MobileSecurityConfig(
          tlsPins: defaultTlsPins,
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
      );

      final writeUseCases = [
        IntegrityUseCase.signIn,
        IntegrityUseCase.signUp,
        IntegrityUseCase.comment,
        IntegrityUseCase.like,
        IntegrityUseCase.flag,
        IntegrityUseCase.appeal,
        IntegrityUseCase.uploadMedia,
        IntegrityUseCase.privacyDsr,
      ];

      for (final uc in writeUseCases) {
        final d = await guard.evaluate(uc);
        expect(d.allow, isFalse, reason: '${uc.name} should be blocked');
      }
    });
  });

  // ─── isDeviceIntegrityBlockedCode ───

  group('isDeviceIntegrityBlockedCode', () {
    test('true for DEVICE_INTEGRITY_BLOCKED', () {
      expect(isDeviceIntegrityBlockedCode('DEVICE_INTEGRITY_BLOCKED'), isTrue);
    });

    test('false for other codes', () {
      expect(isDeviceIntegrityBlockedCode('OTHER'), isFalse);
    });

    test('false for null', () {
      expect(isDeviceIntegrityBlockedCode(null), isFalse);
    });
  });
}

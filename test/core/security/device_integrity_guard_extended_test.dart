import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/security_overrides.dart';

/// Stub device security service that returns a controlled state.
class _StubDeviceSecurityService implements DeviceSecurityService {
  DeviceSecurityState _state;

  _StubDeviceSecurityService(this._state);

  set state(DeviceSecurityState s) => _state = s;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

DeviceSecurityState _cleanDevice() => DeviceSecurityState(
  isRootedOrJailbroken: false,
  isEmulator: false,
  isDebugBuild: false,
  lastCheckedAt: DateTime.now(),
);

DeviceSecurityState _compromisedDevice() => DeviceSecurityState(
  isRootedOrJailbroken: true,
  isEmulator: false,
  isDebugBuild: false,
  lastCheckedAt: DateTime.now(),
);

DeviceSecurityState _emulatorDevice() => DeviceSecurityState(
  isRootedOrJailbroken: false,
  isEmulator: true,
  isDebugBuild: true,
  lastCheckedAt: DateTime.now(),
);

MobileSecurityConfig _secConfig({
  bool blockRooted = true,
  bool allowRootedInPreview = false,
}) => MobileSecurityConfig(
  tlsPins: const TlsPinConfig(
    enabled: false,
    spkiPinsBase64: [],
    strictMode: false,
  ),
  strictDeviceIntegrity: true,
  blockRootedDevices: blockRooted,
  allowRootedInPreviewForQa: allowRootedInPreview,
);

void main() {
  // ────── DeviceIntegrityDecision factories ──────

  group('DeviceIntegrityDecision factories', () {
    test('allow() creates allowing decision', () {
      final d = DeviceIntegrityDecision.allow();
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isFalse);
    });

    test('warnOnly() creates warn-only decision', () {
      final d = DeviceIntegrityDecision.warnOnly('key');
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isTrue);
      expect(d.messageKey, 'key');
    });

    test('block() creates blocking decision with error code', () {
      final d = DeviceIntegrityDecision.block('key');
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.warnOnly, isFalse);
      expect(d.errorCode, 'DEVICE_INTEGRITY_BLOCKED');
      expect(d.messageKey, 'key');
    });
  });

  // ────── DeviceIntegrityGuard.evaluate ──────

  group('DeviceIntegrityGuard.evaluate', () {
    test('allows clean device for any use case', () async {
      final svc = _StubDeviceSecurityService(_cleanDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signIn);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isFalse);
    });

    test('dev environment warn-only for compromised device', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(),
        environment: Environment.development,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('dev environment allows non-compromised even with emulator', () async {
      final svc = _StubDeviceSecurityService(
        DeviceSecurityState(
          isRootedOrJailbroken: false,
          isEmulator: false,
          isDebugBuild: true,
          lastCheckedAt: DateTime.now(),
        ),
      );
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(),
        environment: Environment.development,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signIn);
      expect(decision.allow, isTrue);
    });

    test(
      'staging with QA override returns warn-only for compromised',
      () async {
        final svc = _StubDeviceSecurityService(_compromisedDevice());
        final guard = DeviceIntegrityGuard(
          deviceSecurityService: svc,
          config: _secConfig(allowRootedInPreview: true),
          environment: Environment.preview,
        );

        final decision = await guard.evaluate(IntegrityUseCase.signIn);
        expect(decision.allow, isTrue);
        expect(decision.warnOnly, isTrue);
      },
    );

    test('production blocks write operations on compromised device', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: true),
        environment: Environment.production,
      );

      for (final uc in [
        IntegrityUseCase.signIn,
        IntegrityUseCase.postContent,
        IntegrityUseCase.comment,
        IntegrityUseCase.like,
        IntegrityUseCase.flag,
        IntegrityUseCase.appeal,
        IntegrityUseCase.uploadMedia,
        IntegrityUseCase.privacyDsr,
      ]) {
        final decision = await guard.evaluate(uc);
        expect(decision.allow, isFalse, reason: '$uc should be blocked');
        expect(decision.showBlockingUi, isTrue);
      }
    });

    test('production warn-only for read on compromised device', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: true),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.readFeed);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('production blocks emulator for write operations', () async {
      final svc = _StubDeviceSecurityService(_emulatorDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: true),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signUp);
      expect(decision.allow, isFalse);
    });

    test('production allows when blockRootedDevices is false', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: false),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('override relaxes integrity to warn-only for compromised', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final override = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'testing',
        activatedAt: DateTime.now(),
        validityDuration: const Duration(hours: 1),
      );
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: true),
        environment: Environment.production,
        overrides: override,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('expired override does not relax', () async {
      final svc = _StubDeviceSecurityService(_compromisedDevice());
      final override = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'testing',
        activatedAt: DateTime.now().subtract(const Duration(hours: 25)),
        validityDuration: const Duration(hours: 24),
      );
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: svc,
        config: _secConfig(blockRooted: true),
        environment: Environment.production,
        overrides: override,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isFalse);
    });
  });

  // ────── isDeviceIntegrityBlockedCode ──────

  group('isDeviceIntegrityBlockedCode', () {
    test('returns true for blocked code', () {
      expect(isDeviceIntegrityBlockedCode('DEVICE_INTEGRITY_BLOCKED'), isTrue);
    });

    test('returns false for other codes', () {
      expect(isDeviceIntegrityBlockedCode('OTHER'), isFalse);
    });

    test('returns false for null', () {
      expect(isDeviceIntegrityBlockedCode(null), isFalse);
    });
  });
}

// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/security_overrides.dart';
import 'package:lythaus/core/error/error_codes.dart';

class _FakeDeviceSecurityService implements DeviceSecurityService {
  DeviceSecurityState _state;

  _FakeDeviceSecurityService({DeviceSecurityState? state})
    : _state =
          state ??
          DeviceSecurityState(
            isRootedOrJailbroken: false,
            isEmulator: false,
            isDebugBuild: true,
            lastCheckedAt: DateTime.now(),
          );

  void setCompromised(bool value) {
    _state = DeviceSecurityState(
      isRootedOrJailbroken: value,
      isEmulator: _state.isEmulator,
      isDebugBuild: _state.isDebugBuild,
      lastCheckedAt: DateTime.now(),
    );
  }

  void setEmulator(bool value) {
    _state = DeviceSecurityState(
      isRootedOrJailbroken: _state.isRootedOrJailbroken,
      isEmulator: value,
      isDebugBuild: _state.isDebugBuild,
      lastCheckedAt: DateTime.now(),
    );
  }

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

void main() {
  late _FakeDeviceSecurityService fakeService;
  late MobileSecurityConfig config;

  setUp(() {
    fakeService = _FakeDeviceSecurityService();
    config = const MobileSecurityConfig(
      tlsPins: TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      ),
      strictDeviceIntegrity: false,
      blockRootedDevices: false,
    );
  });

  DeviceIntegrityGuard createGuard({
    Environment environment = Environment.development,
    SecurityOverrideConfig? overrides,
    MobileSecurityConfig? configOverride,
  }) {
    return DeviceIntegrityGuard(
      deviceSecurityService: fakeService,
      config: configOverride ?? config,
      environment: environment,
      overrides: overrides,
    );
  }

  group('DeviceIntegrityDecision factory constructors', () {
    test('allow creates an allowed decision', () {
      final d = DeviceIntegrityDecision.allow();
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isFalse);
      expect(d.messageKey, isNull);
      expect(d.errorCode, isNull);
    });

    test('warnOnly creates a warn-only decision', () {
      final d = DeviceIntegrityDecision.warnOnly('test.key');
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.warnOnly, isTrue);
      expect(d.messageKey, 'test.key');
    });

    test('block creates a blocking decision with error code', () {
      final d = DeviceIntegrityDecision.block('test.block');
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.warnOnly, isFalse);
      expect(d.messageKey, 'test.block');
      expect(d.errorCode, ErrorCodes.deviceIntegrityBlocked);
    });
  });

  group('DeviceIntegrityGuard evaluate policies', () {
    test('clean device always returns allow', () async {
      final guard = createGuard();
      final decision = await guard.evaluate(IntegrityUseCase.signIn);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isFalse);
    });

    test('dev environment returns warnOnly for compromised device', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(environment: Environment.development);
      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('staging with QA override returns warnOnly for compromised', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(
        environment: Environment.preview,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: true,
        ),
      );
      final decision = await guard.evaluate(IntegrityUseCase.signIn);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('production blocks write operations on compromised device', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(
        environment: Environment.production,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
      );
      final decision = await guard.evaluate(IntegrityUseCase.signIn);
      expect(decision.allow, isFalse);
      expect(decision.showBlockingUi, isTrue);
    });

    test('production warns for read-only on compromised device', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(
        environment: Environment.production,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
      );
      final decision = await guard.evaluate(IntegrityUseCase.readFeed);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('emulator on production with write op is blocked', () async {
      fakeService.setEmulator(true);
      final guard = createGuard(
        environment: Environment.production,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
      );
      final decision = await guard.evaluate(IntegrityUseCase.uploadMedia);
      expect(decision.allow, isFalse);
    });

    test('break-glass override relaxes to warnOnly', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(
        environment: Environment.production,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
        overrides: SecurityOverrideConfig(
          relaxDeviceIntegrity: true,
          activatedAt: DateTime.now(),
          validityDuration: const Duration(hours: 1),
          overrideReason: 'test break glass',
        ),
      );
      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('all write use cases are blocked on compromised production', () async {
      fakeService.setCompromised(true);
      final guard = createGuard(
        environment: Environment.production,
        configOverride: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
      );
      for (final useCase in [
        IntegrityUseCase.signIn,
        IntegrityUseCase.signUp,
        IntegrityUseCase.postContent,
        IntegrityUseCase.comment,
        IntegrityUseCase.like,
        IntegrityUseCase.flag,
        IntegrityUseCase.appeal,
        IntegrityUseCase.uploadMedia,
        IntegrityUseCase.privacyDsr,
      ]) {
        final d = await guard.evaluate(useCase);
        expect(d.allow, isFalse, reason: '${useCase.name} should be blocked');
      }
    });
  });
}

/// Tests for device integrity guard
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/security_overrides.dart';
import 'package:lythaus/core/config/environment_config.dart';

/// Mock device security service for testing
class MockDeviceSecurityService implements DeviceSecurityService {
  final DeviceSecurityState Function() _stateProvider;

  MockDeviceSecurityService(this._stateProvider);

  @override
  Future<DeviceSecurityState> evaluateSecurity() async {
    return _stateProvider();
  }

  @override
  void clearCache() {
    // No-op for testing
  }
}

void main() {
  group('DeviceIntegrityDecision', () {
    test('should create allow decision', () {
      final decision = DeviceIntegrityDecision.allow();

      expect(decision.allow, isTrue);
      expect(decision.showBlockingUi, isFalse);
      expect(decision.warnOnly, isFalse);
    });

    test('should create warn-only decision', () {
      final decision = DeviceIntegrityDecision.warnOnly(
        'security.device_compromised_dev',
      );

      expect(decision.allow, isTrue);
      expect(decision.showBlockingUi, isFalse);
      expect(decision.warnOnly, isTrue);
      expect(decision.messageKey, equals('security.device_compromised_dev'));
    });

    test('should create block decision with error code', () {
      final decision = DeviceIntegrityDecision.block(
        'security.device_integrity_blocked',
      );

      expect(decision.allow, isFalse);
      expect(decision.showBlockingUi, isTrue);
      expect(decision.warnOnly, isFalse);
      expect(decision.messageKey, equals('security.device_integrity_blocked'));
      expect(decision.errorCode, equals(ErrorCodes.deviceIntegrityBlocked));
    });
  });

  group('DeviceIntegrityGuard - Development Environment', () {
    test('should warn-only for compromised device in dev', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: true,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.development,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);

      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
      expect(decision.messageKey, equals('security.device_compromised_dev'));
    });

    test('should allow clean device in dev', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: false,
          isEmulator: false,
          isDebugBuild: true,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.development,
      );

      final decision = await guard.evaluate(IntegrityUseCase.readFeed);

      expect(decision.allow, isTrue);
      expect(decision.showBlockingUi, isFalse);
      expect(decision.warnOnly, isFalse);
    });
  });

  group('DeviceIntegrityGuard - Production Environment', () {
    test('should block high-risk operations on compromised device', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signIn);

      expect(decision.allow, isFalse);
      expect(decision.showBlockingUi, isTrue);
      expect(decision.messageKey, equals('security.device_integrity_blocked'));
      expect(decision.errorCode, equals(ErrorCodes.deviceIntegrityBlocked));
    });

    test(
      'should warn-only for low-risk operations on compromised device',
      () async {
        final mockService = MockDeviceSecurityService(() {
          return DeviceSecurityState(
            isRootedOrJailbroken: true,
            isEmulator: false,
            isDebugBuild: false,
            lastCheckedAt: DateTime.now(),
          );
        });

        final guard = DeviceIntegrityGuard(
          deviceSecurityService: mockService,
          config: const MobileSecurityConfig(
            tlsPins: TlsPinConfig(
              enabled: true,
              strictMode: true,
              spkiPinsBase64: ['pin=='],
            ),
            strictDeviceIntegrity: true,
            blockRootedDevices: true,
            allowRootedInPreviewForQa: false,
          ),
          environment: Environment.production,
        );

        final decision = await guard.evaluate(IntegrityUseCase.readFeed);

        expect(decision.allow, isTrue);
        expect(decision.warnOnly, isTrue);
        expect(
          decision.messageKey,
          equals('security.device_compromised_warning'),
        );
      },
    );

    test('should allow clean device for all operations', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: false,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.production,
      );

      for (final useCase in IntegrityUseCase.values) {
        final decision = await guard.evaluate(useCase);
        expect(
          decision.allow,
          isTrue,
          reason: 'Clean device should pass $useCase',
        );
        expect(decision.warnOnly, isFalse);
      }
    });
  });

  group('DeviceIntegrityGuard - Preview with QA Override', () {
    test('should warn-only when allowRootedInPreviewForQa is true', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: false,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: true, // QA override
        ),
        environment: Environment.preview,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);

      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
      expect(
        decision.messageKey,
        equals('security.device_compromised_preview_qa'),
      );
    });
  });

  group('DeviceIntegrityGuard - Security Overrides', () {
    test('should apply override when valid', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      final override = SecurityOverrideConfig.forQa(
        reason: 'Testing payment flow on rooted test device',
        relaxDeviceIntegrity: true,
      );

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.production,
        overrides: override,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signIn);

      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
      expect(
        decision.messageKey,
        equals('security.device_compromised_override'),
      );
    });

    test('should ignore expired override', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      // Create override that expired 1 hour ago
      final expiredOverride = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'Expired test override',
        activatedAt: DateTime.now().subtract(const Duration(hours: 25)),
        validityDuration: const Duration(hours: 24),
      );

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.production,
        overrides: expiredOverride,
      );

      final decision = await guard.evaluate(IntegrityUseCase.signIn);

      // Expired override: should block
      expect(decision.allow, isFalse);
      expect(decision.showBlockingUi, isTrue);
    });
  });

  group('DeviceIntegrityGuard - All Write Operations Blocked', () {
    /// All write use cases that MUST be blocked on compromised devices
    final writeUseCases = [
      IntegrityUseCase.signIn,
      IntegrityUseCase.signUp,
      IntegrityUseCase.postContent,
      IntegrityUseCase.comment,
      IntegrityUseCase.like,
      IntegrityUseCase.flag,
      IntegrityUseCase.appeal,
      IntegrityUseCase.uploadMedia,
      IntegrityUseCase.privacyDsr,
    ];

    /// Read-only use cases that should be allowed with warning
    final readOnlyUseCases = [IntegrityUseCase.readFeed];

    test('blocks ALL write operations on compromised device in prod', () async {
      final mockService = MockDeviceSecurityService(() {
        return DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
      });

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['pin=='],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
        environment: Environment.production,
      );

      for (final useCase in writeUseCases) {
        final decision = await guard.evaluate(useCase);
        expect(
          decision.allow,
          isFalse,
          reason:
              'Write operation $useCase should be blocked on compromised device',
        );
        expect(
          decision.showBlockingUi,
          isTrue,
          reason: '$useCase should show blocking UI',
        );
        expect(
          decision.errorCode,
          equals(ErrorCodes.deviceIntegrityBlocked),
          reason: '$useCase should return DEVICE_INTEGRITY_BLOCKED error code',
        );
        expect(
          decision.messageKey,
          equals('security.device_integrity_blocked'),
          reason: '$useCase should use device_integrity_blocked message',
        );
      }
    });

    test(
      'allows read-only operations with warning on compromised device',
      () async {
        final mockService = MockDeviceSecurityService(() {
          return DeviceSecurityState(
            isRootedOrJailbroken: true,
            isEmulator: false,
            isDebugBuild: false,
            lastCheckedAt: DateTime.now(),
          );
        });

        final guard = DeviceIntegrityGuard(
          deviceSecurityService: mockService,
          config: const MobileSecurityConfig(
            tlsPins: TlsPinConfig(
              enabled: true,
              strictMode: true,
              spkiPinsBase64: ['pin=='],
            ),
            strictDeviceIntegrity: true,
            blockRootedDevices: true,
            allowRootedInPreviewForQa: false,
          ),
          environment: Environment.production,
        );

        for (final useCase in readOnlyUseCases) {
          final decision = await guard.evaluate(useCase);
          expect(
            decision.allow,
            isTrue,
            reason: 'Read-only operation $useCase should be allowed',
          );
          expect(
            decision.warnOnly,
            isTrue,
            reason: '$useCase should show warning',
          );
          expect(
            decision.errorCode,
            isNull,
            reason: 'Read-only operations should not have error code',
          );
        }
      },
    );
  });

  group('ErrorCodes', () {
    test('deviceIntegrityBlocked has stable value', () {
      // This test ensures the error code value never changes accidentally
      expect(
        ErrorCodes.deviceIntegrityBlocked,
        equals('DEVICE_INTEGRITY_BLOCKED'),
      );
    });

    test('ErrorMessages.forCode returns user-friendly message', () {
      final message = ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked);
      expect(message, contains('Posting is disabled'));
      expect(message, contains('security reasons'));
      // Must NOT contain technical details
      expect(message.toLowerCase(), isNot(contains('root')));
      expect(message.toLowerCase(), isNot(contains('jailbreak')));
      expect(message.toLowerCase(), isNot(contains('emulator')));
    });
  });
}

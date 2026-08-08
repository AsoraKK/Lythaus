import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/error/error_codes.dart';

class _MockDeviceSecurityService extends Mock
    implements DeviceSecurityService {}

void main() {
  group('isDeviceIntegrityBlockedCode', () {
    test('true for DEVICE_INTEGRITY_BLOCKED', () {
      expect(
        isDeviceIntegrityBlockedCode(ErrorCodes.deviceIntegrityBlocked),
        isTrue,
      );
    });

    test('false for other code', () {
      expect(isDeviceIntegrityBlockedCode('SOME_OTHER_CODE'), isFalse);
    });

    test('false for null', () {
      expect(isDeviceIntegrityBlockedCode(null), isFalse);
    });

    test('false for empty string', () {
      expect(isDeviceIntegrityBlockedCode(''), isFalse);
    });
  });

  group('showDeviceIntegrityBlockedDialog', () {
    testWidgets('displays security notice dialog', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () async {
                  await showDeviceIntegrityBlockedDialog(context);
                },
                child: const Text('Show'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(find.text('Security Notice'), findsOneWidget);
      expect(find.text('OK'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(find.text('Security Notice'), findsNothing);
    });

    testWidgets('displays with custom message key', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () async {
                  await showDeviceIntegrityBlockedDialog(
                    context,
                    messageKey: 'security.device_compromised_warning',
                  );
                },
                child: const Text('Show'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(
        find.text('Some features may be limited on this device.'),
        findsOneWidget,
      );
    });
  });

  group('showDeviceIntegrityBlockedForCode', () {
    testWidgets('shows dialog for blocked code and returns true', (
      tester,
    ) async {
      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () async {
                  result = await showDeviceIntegrityBlockedForCode(
                    context,
                    code: ErrorCodes.deviceIntegrityBlocked,
                  );
                },
                child: const Text('Check'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Check'));
      await tester.pumpAndSettle();

      expect(find.text('Security Notice'), findsOneWidget);

      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(result, isTrue);
    });

    testWidgets('returns false for non-blocked code', (tester) async {
      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () async {
                  result = await showDeviceIntegrityBlockedForCode(
                    context,
                    code: 'OTHER_CODE',
                  );
                },
                child: const Text('Check'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Check'));
      await tester.pump();

      expect(find.text('Security Notice'), findsNothing);
      expect(result, isFalse);
    });
  });

  group('DeviceIntegrityGuard staging QA override', () {
    test('compromised device in staging with QA flag gets warn-only', () async {
      final mockService = _MockDeviceSecurityService();
      when(() => mockService.evaluateSecurity()).thenAnswer(
        (_) async => DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        ),
      );

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: true,
        ),
        environment: Environment.preview,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isTrue);
      expect(decision.warnOnly, isTrue);
    });

    test('emulator in production blocks write operations', () async {
      final mockService = _MockDeviceSecurityService();
      when(() => mockService.evaluateSecurity()).thenAnswer(
        (_) async => DeviceSecurityState(
          isRootedOrJailbroken: false,
          isEmulator: true,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        ),
      );

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
      );

      final decision = await guard.evaluate(IntegrityUseCase.postContent);
      expect(decision.allow, isFalse);
      expect(decision.showBlockingUi, isTrue);
    });
  });

  group('DeviceIntegrityDecision factories', () {
    test('allow factory produces correct state', () {
      final d = DeviceIntegrityDecision.allow();
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.messageKey, isNull);
      expect(d.errorCode, isNull);
      expect(d.warnOnly, isFalse);
    });

    test('warnOnly factory produces correct state', () {
      final d = DeviceIntegrityDecision.warnOnly('test.key');
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.messageKey, 'test.key');
      expect(d.warnOnly, isTrue);
    });

    test('block factory produces correct state', () {
      final d = DeviceIntegrityDecision.block('test.key');
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.messageKey, 'test.key');
      expect(d.errorCode, ErrorCodes.deviceIntegrityBlocked);
      expect(d.warnOnly, isFalse);
    });
  });

  group('runWithDeviceGuard', () {
    testWidgets('blocked decision shows dialog and skips action', (
      tester,
    ) async {
      final mockService = _MockDeviceSecurityService();
      when(() => mockService.evaluateSecurity()).thenAnswer(
        (_) async => DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        ),
      );

      // Create a guard with production config that actually blocks
      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
        environment: Environment.production,
      );

      bool actionCalled = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceSecurityServiceProvider.overrideWithValue(mockService),
            deviceIntegrityGuardProvider.overrideWithValue(guard),
            deviceSecurityStateProvider.overrideWith(
              (ref) => DeviceSecurityState(
                isRootedOrJailbroken: true,
                isEmulator: false,
                isDebugBuild: false,
                lastCheckedAt: DateTime.now(),
              ),
            ),
          ],
          child: MaterialApp(
            home: Consumer(
              builder: (context, ref, _) {
                return ElevatedButton(
                  onPressed: () async {
                    await runWithDeviceGuard(
                      context,
                      ref,
                      IntegrityUseCase.postContent,
                      () async {
                        actionCalled = true;
                      },
                    );
                  },
                  child: const Text('Post'),
                );
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('Post'));
      await tester.pumpAndSettle();

      // Blocking dialog should appear
      expect(find.text('Security Notice'), findsOneWidget);
      expect(actionCalled, isFalse);

      // Dismiss
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    });

    testWidgets('allowed decision runs action without dialog', (tester) async {
      final mockService = _MockDeviceSecurityService();
      when(() => mockService.evaluateSecurity()).thenAnswer(
        (_) async => DeviceSecurityState(
          isRootedOrJailbroken: false,
          isEmulator: false,
          isDebugBuild: true,
          lastCheckedAt: DateTime.now(),
        ),
      );

      final guard = DeviceIntegrityGuard(
        deviceSecurityService: mockService,
        config: const MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
        environment: Environment.development,
      );

      bool actionCalled = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceSecurityServiceProvider.overrideWithValue(mockService),
            deviceIntegrityGuardProvider.overrideWithValue(guard),
            deviceSecurityStateProvider.overrideWith(
              (ref) => DeviceSecurityState(
                isRootedOrJailbroken: false,
                isEmulator: false,
                isDebugBuild: true,
                lastCheckedAt: DateTime.now(),
              ),
            ),
          ],
          child: MaterialApp(
            home: Consumer(
              builder: (context, ref, _) {
                return ElevatedButton(
                  onPressed: () async {
                    await runWithDeviceGuard(
                      context,
                      ref,
                      IntegrityUseCase.readFeed,
                      () async {
                        actionCalled = true;
                      },
                    );
                  },
                  child: const Text('Read'),
                );
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('Read'));
      await tester.pumpAndSettle();

      expect(find.text('Security Notice'), findsNothing);
      expect(actionCalled, isTrue);
    });
  });
}

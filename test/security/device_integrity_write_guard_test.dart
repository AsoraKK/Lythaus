import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';

class _FakeDeviceSecurityService implements DeviceSecurityService {
  _FakeDeviceSecurityService(this._state);

  final DeviceSecurityState _state;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

class _GuardedActionWidget extends ConsumerStatefulWidget {
  const _GuardedActionWidget();

  @override
  ConsumerState<_GuardedActionWidget> createState() =>
      _GuardedActionWidgetState();
}

class _GuardedActionWidgetState extends ConsumerState<_GuardedActionWidget> {
  bool executed = false;

  @override
  Widget build(BuildContext context) {
    // Watch the provider to ensure it resolves before interaction
    final securityState = ref.watch(deviceSecurityStateProvider);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(executed ? 'executed' : 'blocked'),
        Text(securityState.isLoading ? 'loading' : 'ready'),
        ElevatedButton(
          onPressed: () async {
            await runWithDeviceGuard(
              context,
              ref,
              IntegrityUseCase.postContent,
              () async {
                setState(() => executed = true);
              },
            );
          },
          child: const Text('Post'),
        ),
      ],
    );
  }
}

void main() {
  testWidgets('blocks write actions on compromised devices', (tester) async {
    final compromisedState = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final guard = DeviceIntegrityGuard(
      deviceSecurityService: _FakeDeviceSecurityService(compromisedState),
      config: const MobileSecurityConfig(
        tlsPins: TlsPinConfig(
          enabled: false,
          strictMode: true,
          spkiPinsBase64: [],
        ),
        strictDeviceIntegrity: true,
        blockRootedDevices: true,
      ),
      environment: Environment.production,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          deviceIntegrityGuardProvider.overrideWithValue(guard),
          deviceSecurityServiceProvider.overrideWithValue(
            _FakeDeviceSecurityService(compromisedState),
          ),
          deviceSecurityStateProvider.overrideWith(
            (ref) async => compromisedState,
          ),
        ],
        child: const MaterialApp(
          home: Scaffold(body: Center(child: _GuardedActionWidget())),
        ),
      ),
    );

    // Allow FutureProvider to resolve before tapping
    await tester.pumpAndSettle();

    // Verify provider has resolved
    expect(find.text('ready'), findsOneWidget);

    await tester.tap(find.text('Post'));
    await tester.pumpAndSettle();

    expect(find.text('Security Notice'), findsOneWidget);
    expect(find.text('executed'), findsNothing);
  });
}

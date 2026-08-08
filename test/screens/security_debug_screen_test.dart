import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/screens/security_debug_screen.dart';

class _FakeDeviceSecurityService implements DeviceSecurityService {
  @override
  void clearCache() {}

  @override
  Future<DeviceSecurityState> evaluateSecurity() async {
    return DeviceSecurityState(
      isRootedOrJailbroken: false,
      isEmulator: false,
      isDebugBuild: true,
      lastCheckedAt: DateTime(2024, 1, 1),
    );
  }
}

DeviceIntegrityGuard _buildIntegrityGuard() {
  final config = EnvironmentConfig.fromEnvironment();
  return DeviceIntegrityGuard(
    deviceSecurityService: _FakeDeviceSecurityService(),
    config: config.security,
    environment: config.environment,
  );
}

void main() {
  testWidgets('security debug screen renders dev controls', (tester) async {
    final state = DeviceSecurityState(
      isRootedOrJailbroken: false,
      isEmulator: true,
      isDebugBuild: true,
      lastCheckedAt: DateTime(2024, 1, 1),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          deviceSecurityStateProvider.overrideWith((ref) async => state),
          deviceIntegrityGuardProvider.overrideWith(
            (ref) => _buildIntegrityGuard(),
          ),
        ],
        child: const MaterialApp(home: SecurityDebugScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Security Debug'), findsWidgets);
    expect(find.textContaining('Device Security State'), findsOneWidget);

    final rootedSwitch = find.widgetWithText(
      SwitchListTile,
      'Simulate Rooted Device',
    );
    if (rootedSwitch.evaluate().isNotEmpty) {
      await tester.tap(rootedSwitch);
      await tester.pump();
      expect(find.textContaining('Rooted simulation'), findsOneWidget);

      final tlsButton = find.text('Test TLS Pinning');
      await tester.tap(tlsButton);
      await tester.pumpAndSettle();
      expect(find.text('TLS Pinning Status'), findsOneWidget);

      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
    }
  });

  testWidgets('integrity guard test dialog renders results', (tester) async {
    final state = DeviceSecurityState(
      isRootedOrJailbroken: false,
      isEmulator: false,
      isDebugBuild: true,
      lastCheckedAt: DateTime(2024, 1, 1),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          deviceSecurityStateProvider.overrideWith((ref) async => state),
          deviceIntegrityGuardProvider.overrideWith(
            (ref) => _buildIntegrityGuard(),
          ),
        ],
        child: const MaterialApp(home: SecurityDebugScreen()),
      ),
    );

    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Test Integrity Guard'));
    await tester.pumpAndSettle();

    expect(find.text('Integrity Guard Test Results'), findsOneWidget);
    expect(find.textContaining('Allow'), findsWidgets);
  });
}

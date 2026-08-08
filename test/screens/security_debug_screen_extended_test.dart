// ignore_for_file: public_member_api_docs
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/screens/security_debug_screen.dart';

DeviceSecurityState _cleanState() => DeviceSecurityState(
  isRootedOrJailbroken: false,
  isEmulator: false,
  isDebugBuild: true,
  lastCheckedAt: DateTime(2024, 6, 1),
);

DeviceSecurityState _compromisedState() => DeviceSecurityState(
  isRootedOrJailbroken: true,
  isEmulator: true,
  isDebugBuild: true,
  lastCheckedAt: DateTime(2024, 6, 1),
);

Widget _buildApp(List<Override> overrides) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: SecurityDebugScreen()),
  );
}

void main() {
  group('SecurityDebugScreen environment sections', () {
    testWidgets('renders top-level environment and device sections', (
      tester,
    ) async {
      await tester.pumpWidget(
        _buildApp([
          deviceSecurityStateProvider.overrideWith(
            (ref) async => _cleanState(),
          ),
        ]),
      );
      await tester.pumpAndSettle();

      // Top sections should be visible without scrolling
      expect(find.textContaining('Environment'), findsWidgets);
      expect(find.textContaining('Device Security'), findsOneWidget);
    });

    testWidgets('renders TLS and Mobile config after scrolling', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        _buildApp([
          deviceSecurityStateProvider.overrideWith(
            (ref) async => _cleanState(),
          ),
        ]),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('TLS Pinning'), findsWidgets);
      expect(find.textContaining('Mobile Security'), findsWidgets);
      expect(find.textContaining('Security Overrides'), findsWidgets);
    });

    testWidgets('renders test controls in dev environment', (tester) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        _buildApp([
          deviceSecurityStateProvider.overrideWith(
            (ref) async => _cleanState(),
          ),
        ]),
      );
      await tester.pumpAndSettle();

      // Scroll all the way down to find test controls
      await tester.drag(find.byType(ListView), const Offset(0, -800));
      await tester.pumpAndSettle();

      expect(find.textContaining('Test Controls'), findsOneWidget);
      expect(find.text('Simulate Rooted Device'), findsOneWidget);
      expect(find.text('Simulate TLS Pin Mismatch'), findsOneWidget);
    });

    testWidgets('shows key value pairs for compromised device state', (
      tester,
    ) async {
      await tester.pumpWidget(
        _buildApp([
          deviceSecurityStateProvider.overrideWith(
            (ref) async => _compromisedState(),
          ),
        ]),
      );
      await tester.pumpAndSettle();

      expect(find.text('true'), findsWidgets);
    });

    testWidgets('loading state shows progress indicator', (tester) async {
      final neverComplete = Completer<DeviceSecurityState>();
      await tester.pumpWidget(
        _buildApp([
          deviceSecurityStateProvider.overrideWith(
            (ref) => neverComplete.future,
          ),
        ]),
      );
      // Just pump once so provider is still loading
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}

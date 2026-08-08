import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/security/device_integrity.dart';
import 'package:lythaus/widgets/security_widgets.dart';

class _MockDeviceIntegrityService extends Mock
    implements DeviceIntegrityService {}

void main() {
  late _MockDeviceIntegrityService mockService;

  setUp(() {
    mockService = _MockDeviceIntegrityService();
  });

  group('DeviceSecurityBanner', () {
    testWidgets('shows banner when device is compromised', (tester) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityBanner()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security Warning'), findsOneWidget);
      expect(
        find.text('Device compromised. Posting disabled for security.'),
        findsOneWidget,
      );
    });

    testWidgets('does not show banner when device is secure', (tester) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityBanner()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security Warning'), findsNothing);
    });

    testWidgets('does not show banner when device check fails', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => Future.error(Exception('Check failed')),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityBanner()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security Warning'), findsNothing);
    });

    testWidgets('shows security dialog when info button is tapped', (
      tester,
    ) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityBanner()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap the info button
      await tester.tap(find.byIcon(Icons.info_outline));
      await tester.pumpAndSettle();

      // Check dialog content
      expect(find.text('Device Security'), findsOneWidget);
      expect(
        find.text('Your device appears to be rooted or jailbroken.'),
        findsOneWidget,
      );
      expect(find.text('• You can still read content'), findsOneWidget);
      expect(find.text('• Creating posts is disabled'), findsOneWidget);
      expect(find.text('• Some features may be limited'), findsOneWidget);

      // Tap Understood to close dialog
      await tester.tap(find.text('Understood'));
      await tester.pumpAndSettle();

      // Dialog should be closed
      expect(find.text('Device Security'), findsNothing);
    });
  });

  group('SecureFloatingActionButton', () {
    testWidgets('shows FAB when posting is allowed', (tester) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: MaterialApp(
            home: Scaffold(
              floatingActionButton: SecureFloatingActionButton(
                onPressed: () {},
                child: const Icon(Icons.add),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.byIcon(Icons.add), findsOneWidget);
    });

    testWidgets('shows blocked FAB when posting is not allowed', (
      tester,
    ) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: MaterialApp(
            home: Scaffold(
              floatingActionButton: SecureFloatingActionButton(
                onPressed: () {},
                child: const Icon(Icons.add),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.byIcon(Icons.add), findsOneWidget);
    });

    testWidgets('shows blocked dialog when tapping blocked FAB', (
      tester,
    ) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: MaterialApp(
            home: Scaffold(
              floatingActionButton: SecureFloatingActionButton(
                onPressed: () {},
                child: const Icon(Icons.add),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(find.text('Action Blocked'), findsOneWidget);
      expect(
        find.text(
          'Creating posts is disabled on compromised devices for security reasons. You can still browse and read content.',
        ),
        findsOneWidget,
      );

      // Tap OK to close dialog
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      // Dialog should be closed
      expect(find.text('Action Blocked'), findsNothing);
    });

    testWidgets('calls onPressed when posting is allowed', (tester) async {
      bool pressed = false;

      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: MaterialApp(
            home: Scaffold(
              floatingActionButton: SecureFloatingActionButton(
                onPressed: () => pressed = true,
                child: const Icon(Icons.add),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(pressed, true);
    });
  });

  group('DeviceSecurityStatus', () {
    testWidgets('shows loading state initially', (tester) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      // Initial loading state
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.pumpAndSettle();

      // After loading
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('shows secure status when device is secure', (tester) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security'), findsOneWidget);
      expect(find.text('SECURE'), findsOneWidget);
      expect(find.byIcon(Icons.security), findsOneWidget);
      expect(find.text('Reason: Device integrity verified'), findsOneWidget);
      expect(find.text('Reading'), findsOneWidget);
      expect(find.text('Posting'), findsOneWidget);
    });

    testWidgets('shows compromised status when device is compromised', (
      tester,
    ) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security'), findsOneWidget);
      expect(find.text('COMPROMISED'), findsOneWidget);
      expect(find.byIcon(Icons.security), findsOneWidget);
      expect(find.text('Reason: Device is jailbroken'), findsOneWidget);
      expect(find.text('Reading'), findsOneWidget);
      expect(find.text('Posting'), findsOneWidget);
    });

    testWidgets('shows unknown status when device status is unknown', (
      tester,
    ) async {
      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.unknown,
          reason: 'Check in progress',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security'), findsOneWidget);
      expect(find.text('UNKNOWN'), findsOneWidget);
      expect(find.byIcon(Icons.security), findsOneWidget);
      expect(find.text('Reason: Check in progress'), findsOneWidget);
      expect(find.text('Reading'), findsOneWidget);
      expect(find.text('Posting'), findsOneWidget);
    });

    testWidgets('shows error status when check fails', (tester) async {
      when(
        () => mockService.checkIntegrity(),
      ).thenThrow(Exception('Check failed'));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Device Security'), findsOneWidget);
      expect(
        find.textContaining('Error checking device security'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.security), findsOneWidget);
    });

    testWidgets('shows last checked time when available', (tester) async {
      final lastChecked = DateTime.now().subtract(const Duration(hours: 2));

      when(() => mockService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: lastChecked,
          allowPosting: true,
          allowReading: true,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            deviceIntegrityProvider.overrideWith(
              (ref) => mockService.checkIntegrity(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DeviceSecurityStatus()),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.textContaining('Checked:'), findsOneWidget);
    });
  });
}

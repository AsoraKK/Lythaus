import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/notifications/presentation/notification_permission_prompt.dart';

void main() {
  group('NotificationPermissionPrompt', () {
    testWidgets('should display hero section and benefits', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: NotificationPermissionPrompt(
              onPermissionGranted: () {},
              onPermissionDenied: () {},
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify hero section
      expect(find.text('Stay Connected'), findsOneWidget);

      // Verify benefit items
      expect(find.text('Social Updates'), findsOneWidget);
      expect(find.text('Security Alerts'), findsOneWidget);
      expect(find.text('Full Control'), findsOneWidget);

      // Verify action buttons
      expect(find.text('Enable Notifications'), findsOneWidget);
      expect(find.text('Not Now'), findsOneWidget);
    });

    testWidgets('should call onPermissionGranted when permission granted', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: NotificationPermissionPrompt(
              onPermissionGranted: () {},
              onPermissionDenied: () {},
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Note: Actual permission request requires mocking NotificationPermissionService
      // For now, verify button exists
      expect(find.text('Enable Notifications'), findsOneWidget);
    });

    testWidgets('should call onPermissionDenied when user taps Not Now', (
      tester,
    ) async {
      bool permissionDenied = false;

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: NotificationPermissionPrompt(
              onPermissionGranted: () {},
              onPermissionDenied: () {
                permissionDenied = true;
              },
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Scroll to make "Not Now" button visible
      await tester.ensureVisible(find.text('Not Now'));
      await tester.pumpAndSettle();

      // Tap "Not Now" button
      await tester.tap(find.text('Not Now'));
      await tester.pumpAndSettle();

      expect(permissionDenied, isTrue);
    });
  });
}

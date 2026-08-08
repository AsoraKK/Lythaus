/// Widget tests for privacy widgets — PrivacyCooldownRow, PrivacyErrorBanner,
/// PrivacyBlockingOverlay.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/privacy/widgets/cooldown_row.dart';
import 'package:lythaus/features/privacy/widgets/privacy_error_banner.dart';
import 'package:lythaus/features/privacy/widgets/privacy_blocking_overlay.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );

  group('PrivacyCooldownRow', () {
    testWidgets('displays last request and next available labels', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const PrivacyCooldownRow(
            lastRequestLabel: 'Last export: Jan 15, 2024',
            nextAvailableLabel: 'Next available in 2h 30m',
          ),
        ),
      );

      expect(find.text('Last export: Jan 15, 2024'), findsOneWidget);
      expect(find.text('Next available in 2h 30m'), findsOneWidget);
    });

    testWidgets('shows timer icon', (tester) async {
      await tester.pumpWidget(
        wrap(
          const PrivacyCooldownRow(
            lastRequestLabel: 'Last: now',
            nextAvailableLabel: 'Available in 1h',
          ),
        ),
      );

      expect(find.byIcon(Icons.timer_outlined), findsOneWidget);
    });
  });

  group('PrivacyErrorBanner', () {
    testWidgets('displays error message', (tester) async {
      await tester.pumpWidget(
        wrap(const PrivacyErrorBanner(message: 'Something went wrong')),
      );

      expect(find.text('Something went wrong'), findsOneWidget);
    });

    testWidgets('shows error icon', (tester) async {
      await tester.pumpWidget(
        wrap(const PrivacyErrorBanner(message: 'Error occurred')),
      );

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });
  });

  group('PrivacyBlockingOverlay', () {
    testWidgets('shows progress indicator and deleting text', (tester) async {
      await tester.pumpWidget(
        wrap(
          const SizedBox(
            width: 400,
            height: 400,
            child: PrivacyBlockingOverlay(),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Deleting account…'), findsOneWidget);
    });
  });
}

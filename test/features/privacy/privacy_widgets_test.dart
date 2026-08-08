import 'package:lythaus/features/privacy/widgets/privacy_blocking_overlay.dart';
import 'package:lythaus/features/privacy/widgets/privacy_error_banner.dart';
import 'package:lythaus/features/privacy/widgets/privacy_info_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('PrivacyErrorBanner shows message text', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: PrivacyErrorBanner(message: 'Something broke')),
      ),
    );

    expect(find.text('Something broke'), findsOneWidget);
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });

  testWidgets('PrivacyInfoCard renders resource items', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: PrivacyInfoCard())),
    );

    expect(find.text('Privacy resources'), findsOneWidget);
    expect(find.textContaining('Privacy policy'), findsOneWidget);
    expect(find.textContaining('Data security'), findsOneWidget);
    expect(find.textContaining('Need help?'), findsOneWidget);
  });

  testWidgets('PrivacyBlockingOverlay shows progress indicator', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: PrivacyBlockingOverlay())),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Deleting account…'), findsOneWidget);
  });
}

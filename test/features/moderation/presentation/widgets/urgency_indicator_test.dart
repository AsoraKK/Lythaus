// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/presentation/widgets/urgency_indicator.dart';

void main() {
  group('UrgencyIndicator', () {
    testWidgets('shows Critical for score >= 80', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 95))),
      );
      expect(find.text('Urgency: Critical'), findsOneWidget);
    });

    testWidgets('shows High for score >= 60', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 65))),
      );
      expect(find.text('Urgency: High'), findsOneWidget);
    });

    testWidgets('shows Medium for score >= 40', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 50))),
      );
      expect(find.text('Urgency: Medium'), findsOneWidget);
    });

    testWidgets('shows Low for score < 40', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 20))),
      );
      expect(find.text('Urgency: Low'), findsOneWidget);
    });

    testWidgets('boundary at 80', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 80))),
      );
      expect(find.text('Urgency: Critical'), findsOneWidget);
    });

    testWidgets('boundary at 60', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 60))),
      );
      expect(find.text('Urgency: High'), findsOneWidget);
    });

    testWidgets('boundary at 40', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 40))),
      );
      expect(find.text('Urgency: Medium'), findsOneWidget);
    });

    testWidgets('renders with zero score', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: UrgencyIndicator(score: 0))),
      );
      expect(find.text('Urgency: Low'), findsOneWidget);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/ui/components/xp_progress_ring.dart';

void main() {
  Widget buildWidget({
    double progress = 0.5,
    String tierLabel = 'Free',
    double size = 96,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: XPProgressRing(
            progress: progress,
            tierLabel: tierLabel,
            size: size,
          ),
        ),
      ),
    );
  }

  group('XPProgressRing', () {
    testWidgets('renders percentage text', (tester) async {
      await tester.pumpWidget(buildWidget(progress: 0.75));

      expect(find.text('75%'), findsOneWidget);
    });

    testWidgets('renders tier label', (tester) async {
      await tester.pumpWidget(buildWidget(tierLabel: 'Premium'));

      expect(find.text('Premium'), findsOneWidget);
    });

    testWidgets('renders 0% for zero progress', (tester) async {
      await tester.pumpWidget(buildWidget(progress: 0.0));

      expect(find.text('0%'), findsOneWidget);
    });

    testWidgets('renders 100% for full progress', (tester) async {
      await tester.pumpWidget(buildWidget(progress: 1.0));

      expect(find.text('100%'), findsOneWidget);
    });

    testWidgets('clamps progress above 1.0', (tester) async {
      await tester.pumpWidget(buildWidget(progress: 1.5));

      expect(find.text('150%'), findsOneWidget);
    });

    testWidgets('clamps progress below 0.0', (tester) async {
      await tester.pumpWidget(buildWidget(progress: -0.5));

      expect(find.text('-50%'), findsOneWidget);
    });

    testWidgets('renders XPProgressRing widget', (tester) async {
      await tester.pumpWidget(buildWidget());

      expect(find.byType(XPProgressRing), findsOneWidget);
    });

    testWidgets('respects custom size', (tester) async {
      await tester.pumpWidget(buildWidget(size: 120));

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, 120);
      expect(sizedBox.height, 120);
    });

    testWidgets('default size is 96', (tester) async {
      await tester.pumpWidget(buildWidget());

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, 96);
      expect(sizedBox.height, 96);
    });

    testWidgets('renders with different tier labels', (tester) async {
      await tester.pumpWidget(buildWidget(tierLabel: 'Black'));

      expect(find.text('Black'), findsOneWidget);
    });

    testWidgets('renders fractional progress correctly', (tester) async {
      await tester.pumpWidget(buildWidget(progress: 0.333));

      expect(find.text('33%'), findsOneWidget);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/widgets/reputation_badge.dart';

void main() {
  group('ReputationBadge', () {
    Widget createBadge({
      required int score,
      ReputationBadgeSize size = ReputationBadgeSize.small,
      bool showLabel = false,
    }) {
      return MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: ReputationBadge(score: score, size: size, showLabel: showLabel),
        ),
      );
    }

    group('rendering', () {
      testWidgets('displays score without label by default', (tester) async {
        await tester.pumpWidget(createBadge(score: 42));

        expect(find.text('42'), findsOneWidget);
        expect(find.text('Rep: 42'), findsNothing);
      });

      testWidgets('displays score with label when showLabel is true', (
        tester,
      ) async {
        await tester.pumpWidget(createBadge(score: 150, showLabel: true));

        expect(find.text('Rep: 150'), findsOneWidget);
        expect(find.text('150'), findsNothing);
      });

      testWidgets('renders New tier icon for score < 10', (tester) async {
        await tester.pumpWidget(createBadge(score: 5));

        final iconFinder = find.byIcon(Icons.emoji_events_outlined);
        expect(iconFinder, findsOneWidget);
      });

      testWidgets('renders silver tier icon for score 100-499', (tester) async {
        await tester.pumpWidget(createBadge(score: 250));

        final iconFinder = find.byIcon(Icons.military_tech);
        expect(iconFinder, findsOneWidget);
      });

      testWidgets('renders gold tier icon for score 500-999', (tester) async {
        await tester.pumpWidget(createBadge(score: 750));

        final iconFinder = find.byIcon(Icons.stars);
        expect(iconFinder, findsOneWidget);
      });

      testWidgets('renders platinum tier icon for score >= 1000', (
        tester,
      ) async {
        await tester.pumpWidget(createBadge(score: 1500));

        final iconFinder = find.byIcon(Icons.workspace_premium);
        expect(iconFinder, findsOneWidget);
      });
    });

    group('tier boundaries', () {
      testWidgets('score 0 shows bronze', (tester) async {
        await tester.pumpWidget(createBadge(score: 0));
        expect(find.byIcon(Icons.emoji_events_outlined), findsOneWidget);
      });

      testWidgets('score 99 shows Trusted', (tester) async {
        await tester.pumpWidget(createBadge(score: 99));
        expect(find.byIcon(Icons.verified_outlined), findsOneWidget);
      });

      testWidgets('score 200 shows Established', (tester) async {
        await tester.pumpWidget(createBadge(score: 200));
        expect(find.byIcon(Icons.military_tech), findsOneWidget);
      });

      testWidgets('score 499 shows silver', (tester) async {
        await tester.pumpWidget(createBadge(score: 499));
        expect(find.byIcon(Icons.military_tech), findsOneWidget);
      });

      testWidgets('score 500 shows gold', (tester) async {
        await tester.pumpWidget(createBadge(score: 500));
        expect(find.byIcon(Icons.stars), findsOneWidget);
      });

      testWidgets('score 999 shows gold', (tester) async {
        await tester.pumpWidget(createBadge(score: 999));
        expect(find.byIcon(Icons.stars), findsOneWidget);
      });

      testWidgets('score 1000 shows platinum', (tester) async {
        await tester.pumpWidget(createBadge(score: 1000));
        expect(find.byIcon(Icons.workspace_premium), findsOneWidget);
      });
    });

    group('sizes', () {
      testWidgets('small size renders correctly', (tester) async {
        await tester.pumpWidget(
          createBadge(score: 100, size: ReputationBadgeSize.small),
        );

        final container = tester.widget<Container>(
          find.byType(Container).first,
        );
        final decoration = container.decoration as BoxDecoration;
        expect(decoration.borderRadius, BorderRadius.circular(32));
      });

      testWidgets('medium size renders correctly', (tester) async {
        await tester.pumpWidget(
          createBadge(score: 100, size: ReputationBadgeSize.medium),
        );

        expect(find.byType(ReputationBadge), findsOneWidget);
      });

      testWidgets('large size renders correctly', (tester) async {
        await tester.pumpWidget(
          createBadge(score: 100, size: ReputationBadgeSize.large),
        );

        expect(find.byType(ReputationBadge), findsOneWidget);
      });
    });

    group('tooltip', () {
      testWidgets('shows tier name in tooltip', (tester) async {
        await tester.pumpWidget(createBadge(score: 250));

        // Find the Tooltip widget
        final tooltipFinder = find.byType(Tooltip);
        expect(tooltipFinder, findsOneWidget);

        final tooltip = tester.widget<Tooltip>(tooltipFinder);
        expect(tooltip.message, contains('Established'));
        expect(tooltip.message, contains('250'));
      });
    });

    group('static helpers', () {
      test('getTierName returns correct tier names', () {
        expect(ReputationBadge.getTierName(0), 'New');
        expect(ReputationBadge.getTierName(9), 'New');
        expect(ReputationBadge.getTierName(10), 'Verified');
        expect(ReputationBadge.getTierName(49), 'Verified');
        expect(ReputationBadge.getTierName(50), 'Trusted');
        expect(ReputationBadge.getTierName(199), 'Trusted');
        expect(ReputationBadge.getTierName(200), 'Established');
        expect(ReputationBadge.getTierName(499), 'Established');
        expect(ReputationBadge.getTierName(500), 'Credible');
        expect(ReputationBadge.getTierName(999), 'Credible');
        expect(ReputationBadge.getTierName(1000), 'Highly Credible');
        expect(ReputationBadge.getTierName(5000), 'Highly Credible');
      });

      // Note: getTierColor is now a private method (_tierColor) that depends on ColorScheme
      // Color testing is handled through golden tests and widget integration tests

      test('getTierIcon returns correct icons', () {
        expect(
          ReputationBadge.getTierIcon(5),
          Icons.emoji_events_outlined,
        ); // New
        expect(
          ReputationBadge.getTierIcon(25),
          Icons.check_circle_outline,
        ); // Verified
        expect(
          ReputationBadge.getTierIcon(100),
          Icons.verified_outlined,
        ); // Trusted
        expect(
          ReputationBadge.getTierIcon(300),
          Icons.military_tech,
        ); // Established
        expect(ReputationBadge.getTierIcon(700), Icons.stars); // Credible
        expect(
          ReputationBadge.getTierIcon(1500),
          Icons.workspace_premium,
        ); // Highly Credible
      });
    });
  });

  group('ReputationFormatting extension', () {
    test('formats small numbers as-is', () {
      expect(0.toReputationString(), '0');
      expect(100.toReputationString(), '100');
      expect(999.toReputationString(), '999');
    });

    test('formats thousands with K suffix', () {
      expect(1000.toReputationString(), '1.0K');
      expect(1500.toReputationString(), '1.5K');
      expect(2300.toReputationString(), '2.3K');
      expect(9999.toReputationString(), '10.0K');
    });

    test('formats large numbers without decimal', () {
      expect(10000.toReputationString(), '10K');
      expect(25000.toReputationString(), '25K');
      expect(100000.toReputationString(), '100K');
    });
  });
}

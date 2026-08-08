import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/widgets/reputation_badge.dart';

void main() {
  group('ReputationBadge.getTierName', () {
    test('returns "New" for score < 10', () {
      expect(ReputationBadge.getTierName(0), 'New');
      expect(ReputationBadge.getTierName(9), 'New');
    });

    test('returns "Verified" for score 10–49', () {
      expect(ReputationBadge.getTierName(10), 'Verified');
      expect(ReputationBadge.getTierName(49), 'Verified');
    });

    test('returns "Trusted" for score 50–199', () {
      expect(ReputationBadge.getTierName(50), 'Trusted');
      expect(ReputationBadge.getTierName(199), 'Trusted');
    });

    test('returns "Established" for score 200–499', () {
      expect(ReputationBadge.getTierName(200), 'Established');
    });

    test('returns "Credible" for score 500–999', () {
      expect(ReputationBadge.getTierName(500), 'Credible');
    });

    test('returns "Highly Credible" for score ≥ 1000', () {
      expect(ReputationBadge.getTierName(1000), 'Highly Credible');
      expect(ReputationBadge.getTierName(5000), 'Highly Credible');
    });

    test('no longer returns legacy Bronze/Silver/Gold/Platinum', () {
      expect(ReputationBadge.getTierName(0), isNot('Bronze'));
      expect(ReputationBadge.getTierName(100), isNot('Silver'));
      expect(ReputationBadge.getTierName(500), isNot('Gold'));
      expect(ReputationBadge.getTierName(1000), isNot('Platinum'));
    });
  });

  group('ReputationBadge widget', () {
    testWidgets('renders score text', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ReputationBadge(score: 42))),
      );
      expect(find.text('42'), findsOneWidget);
    });

    testWidgets('shows score with label when showLabel is true', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: ReputationBadge(score: 100, showLabel: true)),
        ),
      );
      expect(find.text('Rep: 100'), findsOneWidget);
    });

    testWidgets('tooltip contains level name', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ReputationBadge(score: 1000))),
      );
      // Verify badge renders without error; tooltip text is 'Highly Credible • 1000 reputation'
      expect(find.byType(Tooltip), findsOneWidget);
      final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
      expect(tooltip.message, contains('Highly Credible'));
    });
  });

  group('ReputationFormatting', () {
    test('formats scores below 1000 as-is', () {
      expect(999.toReputationString(), '999');
      expect(0.toReputationString(), '0');
    });

    test('formats 1000-9999 as X.XK', () {
      expect(1000.toReputationString(), '1.0K');
      expect(1500.toReputationString(), '1.5K');
    });

    test('formats 10000+ as XK', () {
      expect(10000.toReputationString(), '10K');
      expect(15000.toReputationString(), '15K');
    });
  });
}

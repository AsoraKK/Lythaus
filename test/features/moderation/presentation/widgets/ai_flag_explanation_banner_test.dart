/// Widget tests for AiFlagExplanationBanner — standalone widget, no providers.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/widgets/ai_flag_explanation_banner.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

  group('AiFlagExplanationBanner blocked variant', () {
    testWidgets('shows blocked title', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: true)),
      );

      expect(find.text('Content blocked by automated review'), findsOneWidget);
      expect(find.byIcon(Icons.block), findsOneWidget);
    });

    testWidgets('shows blocked explanation text', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: true)),
      );

      expect(
        find.textContaining('may violate community guidelines'),
        findsOneWidget,
      );
    });

    testWidgets('shows appeal button when onAppeal provided', (tester) async {
      var appealed = false;
      await tester.pumpWidget(
        wrap(
          AiFlagExplanationBanner(
            isBlocked: true,
            onAppeal: () => appealed = true,
          ),
        ),
      );

      expect(find.text('Appeal this decision'), findsOneWidget);
      expect(find.byIcon(Icons.gavel), findsOneWidget);

      await tester.tap(find.text('Appeal this decision'));
      expect(appealed, isTrue);
    });

    testWidgets('hides appeal button when onAppeal is null', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: true)),
      );

      expect(find.text('Appeal this decision'), findsNothing);
    });

    testWidgets('shows dismiss icon when onDismiss provided', (tester) async {
      var dismissed = false;
      await tester.pumpWidget(
        wrap(
          AiFlagExplanationBanner(
            isBlocked: true,
            onDismiss: () => dismissed = true,
          ),
        ),
      );

      expect(find.byIcon(Icons.close), findsOneWidget);

      await tester.tap(find.byIcon(Icons.close));
      expect(dismissed, isTrue);
    });

    testWidgets('hides dismiss icon when onDismiss is null', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: true)),
      );

      expect(find.byIcon(Icons.close), findsNothing);
    });
  });

  group('AiFlagExplanationBanner flagged variant', () {
    testWidgets('shows flagged title', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: false)),
      );

      expect(find.text('Content flagged for review'), findsOneWidget);
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
    });

    testWidgets('shows flagged explanation text', (tester) async {
      await tester.pumpWidget(
        wrap(const AiFlagExplanationBanner(isBlocked: false)),
      );

      expect(
        find.textContaining('still visible while under review'),
        findsOneWidget,
      );
    });

    testWidgets('shows appeal button for flagged too', (tester) async {
      await tester.pumpWidget(
        wrap(AiFlagExplanationBanner(isBlocked: false, onAppeal: () {})),
      );

      expect(find.text('Appeal this decision'), findsOneWidget);
    });
  });
}

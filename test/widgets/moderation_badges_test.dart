import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/widgets/moderation_badges.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders status and appeal badges for own content', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationBadges(
            status: ModerationStatus.flagged,
            appealStatus: 'pending',
            isOwnContent: true,
            onAppeal: _noop,
          ),
        ),
      ),
    );

    expect(find.text('Flagged'), findsOneWidget);
    expect(find.text('Appeal Pending'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_forward_ios), findsOneWidget);
  });

  testWidgets('renders no badge for clean content', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ModerationBadges(status: ModerationStatus.clean)),
      ),
    );

    expect(find.text('Flagged'), findsNothing);
    expect(find.text('Blocked'), findsNothing);
  });

  testWidgets('moderation banner shows appeal and dismiss actions', (
    tester,
  ) async {
    var appealTapped = false;
    var dismissed = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ModerationInfoBanner(
            status: ModerationStatus.hidden,
            message: 'Blocked',
            onAppeal: () => appealTapped = true,
            onDismiss: () => dismissed = true,
          ),
        ),
      ),
    );

    expect(find.text('Content Blocked'), findsOneWidget);
    expect(find.text('Appeal decision'), findsOneWidget);

    await tester.tap(find.text('Appeal decision'));
    await tester.tap(find.byIcon(Icons.close));
    await tester.pump();

    expect(appealTapped, isTrue);
    expect(dismissed, isTrue);
  });

  testWidgets('renders hidden badge for hidden content', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationBadges(
            status: ModerationStatus.hidden,
            isOwnContent: true,
          ),
        ),
      ),
    );

    expect(find.text('Blocked'), findsOneWidget);
  });

  testWidgets('appeal badge shows approved status', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationBadges(
            status: ModerationStatus.flagged,
            appealStatus: 'approved',
            isOwnContent: true,
          ),
        ),
      ),
    );

    expect(find.text('Appeal Approved'), findsOneWidget);
  });

  testWidgets('appeal badge shows rejected status', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationBadges(
            status: ModerationStatus.hidden,
            appealStatus: 'rejected',
            isOwnContent: true,
          ),
        ),
      ),
    );

    expect(find.text('Appeal Rejected'), findsOneWidget);
  });

  testWidgets('does not show appeal badge for non-own content', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationBadges(
            status: ModerationStatus.flagged,
            appealStatus: 'pending',
            isOwnContent: false,
          ),
        ),
      ),
    );

    expect(find.text('Appeal Pending'), findsNothing);
    expect(find.text('Flagged'), findsOneWidget);
  });

  testWidgets('moderation banner without appeal callback hides appeal button', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ModerationInfoBanner(
            status: ModerationStatus.flagged,
            message: 'Flagged for review',
            onDismiss: _noop,
          ),
        ),
      ),
    );

    expect(find.text('Appeal decision'), findsNothing);
  });
}

void _noop() {}

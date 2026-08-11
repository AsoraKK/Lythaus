import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/widgets/appeal_dialog.dart';

void main() {
  testWidgets('explains the case-gated appeal process without a public form', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AppealDialog(
            contentId: 'post-123',
            contentType: 'post',
            contentPreview: 'Sample preview text',
            currentStatus: ModerationStatus.hidden,
          ),
        ),
      ),
    );

    expect(find.text('Appeal information'), findsOneWidget);
    expect(
      find.textContaining('eligible resolved moderation case'),
      findsOneWidget,
    );
    expect(
      find.textContaining('five independently assigned trained reviewers'),
      findsOneWidget,
    );
    expect(find.text('Sample preview text'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Submit Appeal'), findsNothing);
  });

  testWidgets('uses adjudicated outcome language for a blocked appeal', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AppealDialog(
            contentId: 'post-789',
            contentType: 'post',
            currentStatus: ModerationStatus.appealUpheld,
          ),
        ),
      ),
    );

    expect(
      find.text('This appeal was resolved and the content remains blocked.'),
      findsOneWidget,
    );
  });
}

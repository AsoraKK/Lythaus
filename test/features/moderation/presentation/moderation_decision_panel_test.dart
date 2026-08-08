import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_decision_panel.dart';

void main() {
  testWidgets('moderation decision panel validates and submits', (
    tester,
  ) async {
    ModerationDecisionInput? submitted;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ModerationDecisionPanel(onSubmit: (input) => submitted = input),
        ),
      ),
    );

    await tester.tap(find.text('Allow'));
    await tester.pump();

    await tester.enterText(find.byType(TextFormField), 'short');
    await tester.tap(find.text('Submit decision'));
    await tester.pump();
    expect(
      find.text('Provide at least 8 characters of rationale.'),
      findsOneWidget,
    );

    await tester.enterText(find.byType(TextFormField), 'Approved content');
    await tester.tap(find.byType(Switch));
    await tester.pump();

    await tester.tap(find.text('Submit decision'));
    await tester.pump();

    expect(submitted, isNotNull);
    expect(submitted!.action, ModerationDecisionAction.allow);
    expect(submitted!.policyTest, isTrue);
  });
}

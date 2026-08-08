import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/screens/moderation_demo_page.dart';

void main() {
  testWidgets('moderation demo page does not expose AI score controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: ModerationDemoPage())),
    );

    expect(find.text('AI Scores'), findsNothing);
    expect(find.text('Show AI Scores'), findsNothing);
    expect(find.byType(Switch), findsNothing);
    expect(find.textContaining('AI scores'), findsNothing);
    expect(find.textContaining('confidence ratings'), findsNothing);
    expect(
      find.textContaining('View moderation status and appeal flow'),
      findsOneWidget,
    );
  });
}

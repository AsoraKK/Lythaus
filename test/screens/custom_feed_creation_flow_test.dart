import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/ui/screens/home/custom_feed_creation_flow.dart';

void main() {
  testWidgets('custom feed creation flow advances through steps', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
    );

    expect(find.text('What type of content?'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    expect(find.text('How should posts be sorted?'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    expect(find.text('Custom feed filters'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'ai, news');
    await tester.tap(find.text('Save refinements'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    expect(find.text('Name your feed'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'My Feed');
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();

    expect(find.text('Almost there!'), findsOneWidget);
    expect(find.text('Feed Summary'), findsOneWidget);

    await tester.tap(find.widgetWithText(SwitchListTile, 'Set as home feed'));
    await tester.pump();
  });
}

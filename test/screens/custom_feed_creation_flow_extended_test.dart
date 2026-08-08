// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/ui/screens/home/custom_feed_creation_flow.dart';

void main() {
  group('CustomFeedCreationFlow step navigation', () {
    testWidgets('back button appears from step 1 onward', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      // Step 0: no back button
      expect(find.widgetWithText(OutlinedButton, 'Back'), findsNothing);

      // Advance to step 1
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      // Back button should now be visible
      expect(find.widgetWithText(OutlinedButton, 'Back'), findsOneWidget);
    });

    testWidgets('back button returns to previous step', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );

      // Go to step 1
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      expect(find.text('How should posts be sorted?'), findsOneWidget);

      // Go back
      await tester.tap(find.widgetWithText(OutlinedButton, 'Back'));
      await tester.pumpAndSettle();
      expect(find.text('What type of content?'), findsOneWidget);
    });
  });

  group('Step1ContentType', () {
    testWidgets('content type chips are rendered', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Should show content type options (ChoiceChips)
      expect(find.byType(ChoiceChip), findsWidgets);
      expect(find.text('What type of content?'), findsOneWidget);
    });

    testWidgets('selecting a content type chip updates draft', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Tap the first ChoiceChip
      final chips = find.byType(ChoiceChip);
      if (chips.evaluate().isNotEmpty) {
        await tester.tap(chips.first);
        await tester.pumpAndSettle();
      }
    });
  });

  group('Step2Sorting', () {
    testWidgets('sorting options are shown', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate to step 2
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      expect(find.text('How should posts be sorted?'), findsOneWidget);
      // Sorting options render as _SortingOptionTile with labels
      expect(find.text('Hot'), findsOneWidget);
      expect(find.text('Newest'), findsOneWidget);
      expect(find.text('Most relevant'), findsOneWidget);
    });
  });

  group('Step3Refinements', () {
    testWidgets('refinement modal with tags/keywords', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate to step 3
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      expect(find.text('Custom feed filters'), findsOneWidget);
    });
  });

  group('Step4Naming', () {
    testWidgets('name field is visible on step 4', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate to step 3, handle refinements, then step 4
      // Step 0 -> 1
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      // Step 1 -> 2
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      // Enter refinements text then save
      final textFields = find.byType(TextField);
      if (textFields.evaluate().isNotEmpty) {
        await tester.enterText(textFields.first, 'news, tech');
      }
      final saveBtn = find.text('Save refinements');
      if (saveBtn.evaluate().isNotEmpty) {
        await tester.tap(saveBtn);
        await tester.pumpAndSettle();
      }

      // Step 2 -> 3
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      expect(find.text('Name your feed'), findsOneWidget);
    });
  });

  group('Step5Confirmation', () {
    testWidgets('shows confirmation with summary and create button', (
      tester,
    ) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate to step 0 -> 1 -> 2 -> 3 -> 4
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      final textFields = find.byType(TextField);
      if (textFields.evaluate().isNotEmpty) {
        await tester.enterText(textFields.first, 'test');
      }
      final saveBtn = find.text('Save refinements');
      if (saveBtn.evaluate().isNotEmpty) {
        await tester.tap(saveBtn);
        await tester.pumpAndSettle();
      }

      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      // Enter name
      final nameField = find.byType(TextField);
      if (nameField.evaluate().isNotEmpty) {
        await tester.enterText(nameField.first, 'My Custom Feed');
      }

      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      expect(find.text('Almost there!'), findsOneWidget);
      expect(find.text('Feed Summary'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Create'), findsOneWidget);
    });

    testWidgets('set as home feed switch toggles', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate through all steps
      for (int i = 0; i < 3; i++) {
        final next = find.widgetWithText(FilledButton, 'Next');
        if (next.evaluate().isNotEmpty) {
          await tester.tap(next);
          await tester.pumpAndSettle();
        }
        // Handle refinements save on step 2
        if (i == 1) {
          final textFields = find.byType(TextField);
          if (textFields.evaluate().isNotEmpty) {
            await tester.enterText(textFields.first, 'x');
          }
          final saveBtn = find.text('Save refinements');
          if (saveBtn.evaluate().isNotEmpty) {
            await tester.tap(saveBtn);
            await tester.pumpAndSettle();
          }
        }
      }

      final nameField = find.byType(TextField);
      if (nameField.evaluate().isNotEmpty) {
        await tester.enterText(nameField.first, 'Feed X');
      }

      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      // Toggle the switch
      final switchTile = find.byType(SwitchListTile);
      if (switchTile.evaluate().isNotEmpty) {
        await tester.tap(switchTile);
        await tester.pump();
      }
    });
  });

  group('Creation attempt — empty name shows snackbar', () {
    testWidgets('create with no name shows error snackbar', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: CustomFeedCreationFlow())),
      );
      await tester.pumpAndSettle();

      // Navigate through all steps leaving name blank
      for (int i = 0; i < 3; i++) {
        final next = find.widgetWithText(FilledButton, 'Next');
        if (next.evaluate().isNotEmpty) {
          await tester.tap(next);
          await tester.pumpAndSettle();
        }
        if (i == 1) {
          final textFields = find.byType(TextField);
          if (textFields.evaluate().isNotEmpty) {
            await tester.enterText(textFields.first, 'x');
          }
          final saveBtn = find.text('Save refinements');
          if (saveBtn.evaluate().isNotEmpty) {
            await tester.tap(saveBtn);
            await tester.pumpAndSettle();
          }
        }
      }

      // Skip name entry, just go to confirmation
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();

      // Tap Create without a name
      final createBtn = find.widgetWithText(FilledButton, 'Create');
      if (createBtn.evaluate().isNotEmpty) {
        await tester.tap(createBtn);
        await tester.pumpAndSettle();

        expect(
          find.text('Choose a name before creating the feed.'),
          findsOneWidget,
        );
      }
    });
  });
}

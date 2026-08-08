// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/presentation/widgets/empty_state_widget.dart';

void main() {
  group('EmptyStateWidget', () {
    testWidgets('shows title and subtitle', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(
              title: 'No items',
              subtitle: 'Nothing to see here',
            ),
          ),
        ),
      );
      expect(find.text('No items'), findsOneWidget);
      expect(find.text('Nothing to see here'), findsOneWidget);
    });

    testWidgets('shows default icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(title: 'Empty', subtitle: 'desc'),
          ),
        ),
      );
      expect(find.byIcon(Icons.inbox_outlined), findsOneWidget);
    });

    testWidgets('shows custom icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(
              title: 'Empty',
              subtitle: 'desc',
              icon: Icons.search_off,
            ),
          ),
        ),
      );
      expect(find.byIcon(Icons.search_off), findsOneWidget);
    });

    testWidgets('shows action button when label and callback provided', (
      tester,
    ) async {
      var tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(
              title: 'No results',
              subtitle: 'Try creating one',
              actionLabel: 'Create',
              onAction: () => tapped = true,
            ),
          ),
        ),
      );
      expect(find.text('Create'), findsOneWidget);
      await tester.tap(find.text('Create'));
      expect(tapped, isTrue);
    });

    testWidgets('hides action button when no callback', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(
              title: 'No results',
              subtitle: 'desc',
              actionLabel: 'Create',
            ),
          ),
        ),
      );
      expect(find.byType(ElevatedButton), findsNothing);
    });

    testWidgets('hides action button when no label', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: EmptyStateWidget(
              title: 'No results',
              subtitle: 'desc',
              onAction: () {},
            ),
          ),
        ),
      );
      expect(find.byType(ElevatedButton), findsNothing);
    });
  });
}

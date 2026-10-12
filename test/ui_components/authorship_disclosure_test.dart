import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/ui/components/authorship_disclosure.dart';

void main() {
  testWidgets('declaration and confirmed assessment remain distinct', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              AuthorshipDisclosure(
                label: 'Human-authored',
                classificationSource: 'user_disclosure',
              ),
              AuthorshipDisclosure(
                label: 'Human-authored',
                classificationSource: 'automated_classification',
                classificationState: 'confirmed',
              ),
              AuthorshipDisclosure(
                label: 'Human-authored',
                classificationSource: 'automated_classification',
              ),
              AuthorshipDisclosure(
                label: 'Human-authored',
                classificationSource: 'unknown',
                classificationState: 'confirmed',
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Author declaration: Human-authored'), findsOneWidget);
    expect(find.text('Authorship assessment: Human-authored'), findsOneWidget);
    expect(find.text('Authorship: Under review'), findsNWidgets(2));
    expect(find.textContaining('verified'), findsNothing);
  });
}

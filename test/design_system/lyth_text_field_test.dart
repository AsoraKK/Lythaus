import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';

void main() {
  testWidgets('LythTextField validates and reports changes', (tester) async {
    final formKey = GlobalKey<FormState>();
    var latest = '';

    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: Form(
            key: formKey,
            child: LythTextField(
              label: 'Name',
              onChanged: (value) => latest = value,
              validator: (value) =>
                  value == null || value.isEmpty ? 'Required' : null,
            ),
          ),
        ),
      ),
    );

    formKey.currentState!.validate();
    await tester.pump();
    expect(find.text('Required'), findsWidgets);

    await tester.enterText(find.byType(TextField), 'Alex');
    await tester.pump();
    expect(latest, 'Alex');

    formKey.currentState!.validate();
    await tester.pump();
    expect(find.text('Required'), findsNothing);
  });

  testWidgets('LythTextField.password configures obscure input', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: LythTextField.password(label: 'Password', onChanged: (_) {}),
        ),
      ),
    );

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.obscureText, isTrue);
    expect(find.byIcon(Icons.lock), findsOneWidget);
  });

  testWidgets('LythTextField.email sets email input action', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: LythTextField.email(label: 'Email', onChanged: (_) {}),
        ),
      ),
    );

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.textInputAction, TextInputAction.next);
    expect(find.byIcon(Icons.email), findsOneWidget);
  });
}

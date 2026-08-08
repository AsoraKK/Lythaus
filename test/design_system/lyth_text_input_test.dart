import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';

void main() {
  testWidgets('LythTextInput renders label, helper, and icons', (tester) async {
    var submitted = false;
    var changedValue = '';

    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: Scaffold(
          body: LythTextInput(
            label: 'Email',
            placeholder: 'you@example.com',
            helperText: 'Use your work email.',
            prefixIcon: Icons.email,
            suffixIcon: Icons.clear,
            suffixIconOnPressed: () {},
            onChanged: (value) => changedValue = value,
            onSubmitted: () => submitted = true,
          ),
        ),
      ),
    );

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Use your work email.'), findsOneWidget);
    expect(find.byIcon(Icons.email), findsOneWidget);
    expect(find.byIcon(Icons.clear), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'a@b.com');
    await tester.pump();
    expect(changedValue, 'a@b.com');

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(submitted, isTrue);
  });

  testWidgets('LythTextInput password supports error and disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          body: LythTextInput.password(
            label: 'Password',
            onChanged: _noop,
            errorText: 'Required',
            disabled: true,
          ),
        ),
      ),
    );

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.obscureText, isTrue);
    expect(textField.enabled, isFalse);
    expect(textField.decoration?.errorText, 'Required');
  });

  testWidgets('LythTextInput updates controller when value changes', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          body: LythTextInput(
            label: 'Status',
            value: 'alpha',
            onChanged: _noop,
          ),
        ),
      ),
    );

    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'alpha',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          body: LythTextInput(label: 'Status', value: 'beta', onChanged: _noop),
        ),
      ),
    );

    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'beta',
    );
  });
}

void _noop(String _) {}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';
import '../golden_test_utils.dart';

/// Golden test surface size for LythTextField - tall enough for 3 text fields
const Size _kTextFieldGoldenSize = Size(400, 350);

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
  });

  testWidgets('LythTextField states - light', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.light(),
      surfaceSize: _kTextFieldGoldenSize,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LythTextField(label: 'Email', placeholder: 'you@lythaus.co'),
            const SizedBox(height: 16),
            LythTextField(
              label: 'Email',
              placeholder: 'you@lythaus.co',
              errorText: 'Invalid email',
            ),
            const SizedBox(height: 16),
            LythTextField(
              label: 'Email',
              placeholder: 'you@lythaus.co',
              disabled: true,
            ),
          ],
        ),
      ),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_text_field_light.png'),
    );
  });

  testWidgets('LythTextField states - dark', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.dark(),
      surfaceSize: _kTextFieldGoldenSize,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LythTextField(label: 'Email', placeholder: 'you@lythaus.co'),
            const SizedBox(height: 16),
            LythTextField(
              label: 'Email',
              placeholder: 'you@lythaus.co',
              errorText: 'Invalid email',
            ),
            const SizedBox(height: 16),
            LythTextField(
              label: 'Email',
              placeholder: 'you@lythaus.co',
              disabled: true,
            ),
          ],
        ),
      ),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_text_field_dark.png'),
    );
  });
}

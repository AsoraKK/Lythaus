import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';
import '../golden_test_utils.dart';

/// Golden test surface size for LythButton - tall enough for 5 button variants
const Size _kButtonGoldenSize = Size(400, 350);

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
  });

  testWidgets('LythButton variants - light', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.light(),
      surfaceSize: _kButtonGoldenSize,
      child: const Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LythButton(label: 'Primary', variant: LythButtonVariant.primary),
            SizedBox(height: 12),
            LythButton(
              label: 'Secondary',
              variant: LythButtonVariant.secondary,
            ),
            SizedBox(height: 12),
            LythButton(label: 'Tertiary', variant: LythButtonVariant.tertiary),
            SizedBox(height: 12),
            LythButton(
              label: 'Destructive',
              variant: LythButtonVariant.destructive,
            ),
            SizedBox(height: 12),
            LythButton(
              label: 'Loading',
              variant: LythButtonVariant.primary,
              isLoading: true,
            ),
          ],
        ),
      ),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_button_light.png'),
    );
  });

  testWidgets('LythButton variants - dark', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.dark(),
      surfaceSize: _kButtonGoldenSize,
      child: const Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LythButton(label: 'Primary', variant: LythButtonVariant.primary),
            SizedBox(height: 12),
            LythButton(
              label: 'Secondary',
              variant: LythButtonVariant.secondary,
            ),
            SizedBox(height: 12),
            LythButton(label: 'Tertiary', variant: LythButtonVariant.tertiary),
            SizedBox(height: 12),
            LythButton(
              label: 'Destructive',
              variant: LythButtonVariant.destructive,
            ),
            SizedBox(height: 12),
            LythButton(
              label: 'Loading',
              variant: LythButtonVariant.primary,
              isLoading: true,
            ),
          ],
        ),
      ),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_button_dark.png'),
    );
  });
}

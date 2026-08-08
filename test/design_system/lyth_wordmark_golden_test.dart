import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';
import '../golden_test_utils.dart';

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
  });

  testWidgets('LythWordmark static - light', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.light(),
      child: const LythWordmarkStatic(size: LythWordmarkSize.large),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_wordmark_light.png'),
    );
  });

  testWidgets('LythWordmark static - dark', (tester) async {
    await pumpGoldenWidget(
      tester,
      theme: LythausTheme.dark(),
      child: const LythWordmarkStatic(size: LythWordmarkSize.large),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/lyth_wordmark_dark.png'),
    );
  });
}

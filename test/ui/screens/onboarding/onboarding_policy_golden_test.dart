import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/screens/lock_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';
import '../../../golden_test_utils.dart';

const Size _kOnboardingGoldenSize = Size(420, 760);

Future<void> _pumpGoldenScreen(
  WidgetTester tester, {
  required Widget child,
  ThemeData? theme,
  Size surfaceSize = _kOnboardingGoldenSize,
}) async {
  await tester.binding.setSurfaceSize(surfaceSize);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(
        size: surfaceSize,
        devicePixelRatio: 1.0,
        textScaler: TextScaler.noScaling,
        platformBrightness: theme?.brightness == Brightness.dark
            ? Brightness.dark
            : Brightness.light,
      ),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: theme,
        home: child,
      ),
    ),
  );

  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
  });

  testWidgets('Onboarding intro policy copy - light', (tester) async {
    await _pumpGoldenScreen(
      tester,
      theme: LythausTheme.light(),
      child: const OnboardingIntroScreen(),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/onboarding_intro_policy_light.png'),
    );
  });

  testWidgets('First post lock policy copy - light', (tester) async {
    await _pumpGoldenScreen(
      tester,
      theme: LythausTheme.light(),
      child: const ProviderScope(child: FirstPostLockScreen()),
    );

    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/first_post_lock_policy_light.png'),
    );
  });
}

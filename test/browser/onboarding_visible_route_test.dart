import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

import 'onboarding_visible_route.dart';

void main() {
  testWidgets('component uses one existing Navigator and preserves its stack', (
    tester,
  ) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    await tester.binding.setSurfaceSize(const Size(320, 960));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
            disableAnimations: false,
          ),
          child: child!,
        ),
        home: const Scaffold(body: Text('Original visible host')),
      ),
    );
    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    final route = onboardingComponentRoute();
    expect(route.transitionDuration, Duration.zero);
    expect(route.reverseTransitionDuration, Duration.zero);
    expect(route.requestFocus, isFalse);
    navigator.push(route);
    await tester.pumpAndSettle();
    expect(find.byType(Navigator), findsOneWidget);
    final component = tester.element(find.byType(OnboardingIntroScreen));
    expect(Navigator.of(component), same(navigator));
    expect(MediaQuery.of(component).disableAnimations, isTrue);
    expect(MediaQuery.of(component).textScaler.scale(14), 28);
    expect(Theme.of(component).colorScheme, LythausTheme.light().colorScheme);
    expect(
      ModalRoute.of(component)?.settings.name,
      onboardingComponentRouteName,
    );
    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic continuation completed'), findsOneWidget);
    expect(find.byType(Navigator), findsOneWidget);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(find.byType(OnboardingIntroScreen), findsOneWidget);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(find.text('Original visible host'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

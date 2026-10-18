import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

import 'onboarding_visible_route.dart';

void main() {
  for (final dark in [false, true]) {
    for (final width in [320.0, 390.0, 1440.0]) {
      final scale = width == 320 ? 2.0 : 1.0;
      final theme = dark ? LythausTheme.dark() : LythausTheme.light();
      final name =
          'brand onboarding companion ${dark ? 'dark' : 'light'} ${width.toInt()} scale$scale';
      testWidgets(name, (tester) async {
        GoogleFonts.config.allowRuntimeFetching = false;
        await tester.binding.setSurfaceSize(Size(width, 960));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
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
        final onstageText = <String>[];
        void visitOnstage(Element element) {
          final widget = element.widget;
          if (widget is Text && widget.data != null) {
            onstageText.add(widget.data!);
          }
          element.debugVisitOnstageChildren(visitOnstage);
        }

        visitOnstage(WidgetsBinding.instance.rootElement!);
        expect(onstageText, isNot(contains('Original visible host')));
        expect(onstageText, contains('Welcome to Lythaus'));
        expect(
          find.text('Original visible host', skipOffstage: false),
          findsOneWidget,
        );
        final component = tester.element(find.byType(OnboardingIntroScreen));
        expect(Navigator.of(component), same(navigator));
        expect(MediaQuery.of(component).disableAnimations, isTrue);
        expect(MediaQuery.of(component).textScaler.scale(14), 14 * scale);
        expect(Theme.of(component).colorScheme, theme.colorScheme);
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
        debugPrint('VERIFIED: $name');
      });
    }
  }
}

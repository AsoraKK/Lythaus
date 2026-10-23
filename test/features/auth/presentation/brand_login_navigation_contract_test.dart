import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class _AuthService extends Mock implements AuthService {}

class _NavigationObserver extends NavigatorObserver {
  int completions = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route.settings.name == 'synthetic-completion') completions++;
    super.didPush(route, previousRoute);
  }
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  for (final dark in [false, true]) {
    for (final width in [320.0, 390.0, 1440.0]) {
      final scale = width == 320 ? 2.0 : 1.0;
      final theme = dark ? 'dark' : 'light';
      testWidgets(
        'brand login companion $theme ${width.toInt()} ${scale.toInt()}x '
        'awaits guest auth before one callback and Navigator push',
        (tester) async {
          final auth = _AuthService();
          final pendingLogout = Completer<void>();
          var authCalls = 0;
          var authCompleted = false;
          var callbacks = 0;
          final observer = _NavigationObserver();
          when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
          when(() => auth.logout()).thenAnswer((_) async {
            authCalls++;
            await pendingLogout.future;
            authCompleted = true;
          });
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 960);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                enhancedAuthServiceProvider.overrideWithValue(auth),
                analyticsClientProvider.overrideWithValue(
                  const NullAnalyticsClient(),
                ),
              ],
              child: MaterialApp(
                theme: dark ? LythausTheme.dark() : LythausTheme.light(),
                navigatorObservers: [observer],
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(scale),
                    disableAnimations: true,
                  ),
                  child: child!,
                ),
                home: Builder(
                  builder: (context) => AuthChoiceScreen(
                    onContinueAsGuest: () {
                      expect(authCompleted, isTrue);
                      callbacks++;
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          settings: const RouteSettings(
                            name: 'synthetic-completion',
                          ),
                          builder: (_) => const Scaffold(
                            body: Center(
                              child: Text('Synthetic continuation completed'),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final screen = tester.element(find.byType(AuthChoiceScreen));
          final container = ProviderScope.containerOf(screen);
          expect(MediaQuery.textScalerOf(screen).scale(14) / 14, scale);
          expect(MediaQuery.sizeOf(screen).width, width);
          expect(
            Theme.of(screen).brightness,
            dark ? Brightness.dark : Brightness.light,
          );
          await tester.ensureVisible(find.text('Continue as guest'));
          await tester.tap(find.text('Continue as guest'));
          await tester.pump(const Duration(milliseconds: 250));
          expect(authCalls, 1);
          expect(authCompleted, isFalse);
          expect(container.read(guestModeProvider), isFalse);
          expect(callbacks, 0);
          expect(observer.completions, 0);
          expect(find.text('Synthetic continuation completed'), findsNothing);
          await tester.tap(find.text('Continue as guest'));
          await tester.pump();
          expect(authCalls, 1);
          pendingLogout.complete();
          await tester.pumpAndSettle();
          expect(authCalls, 1);
          expect(authCompleted, isTrue);
          expect(container.read(guestModeProvider), isTrue);
          expect(callbacks, 1);
          expect(observer.completions, 1);
          expect(find.text('Synthetic continuation completed'), findsOneWidget);
          verify(() => auth.logout()).called(1);
          expect(tester.takeException(), isNull);
          // The concurrent full-suite reporter can omit individual test names.
          // Emit this only after every assertion passes so hosted logs retain all six.
          debugPrint(
            'VERIFIED brand login companion $theme ${width.toInt()} '
            '${scale.toInt()}x: awaited auth, one callback, one Navigator push',
          );
        },
      );
    }
  }
}

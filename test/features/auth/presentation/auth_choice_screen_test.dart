import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/widgets/lyth_loading_wordmark.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class _MockAuthService extends Mock implements AuthService {}

class _MockIntegrityGuard extends Mock implements DeviceIntegrityGuard {}

void main() {
  for (final outcome in ['success', 'error', 'disposed']) {
    testWidgets('long sign-in light stops on $outcome', (tester) async {
      final auth = _MockAuthService();
      final guard = _MockIntegrityGuard();
      final pending = Completer<User>();
      when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
      when(
        () => guard.evaluate(IntegrityUseCase.signIn),
      ).thenAnswer((_) async => DeviceIntegrityDecision.allow());
      when(
        () => auth.loginWithEmail(any(), any()),
      ).thenAnswer((_) => pending.future);
      var completed = 0;
      await tester.binding.setSurfaceSize(const Size(430, 950));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            analyticsClientProvider.overrideWithValue(
              const NullAnalyticsClient(),
            ),
            enhancedAuthServiceProvider.overrideWithValue(auth),
            deviceIntegrityGuardProvider.overrideWithValue(guard),
          ],
          child: MaterialApp(
            home: AuthChoiceScreen(onSignedIn: () => completed++),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<LythLoadingWordmark>(find.byType(LythLoadingWordmark))
            .active,
        isFalse,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Email'),
        'synthetic@example.invalid',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'historical12',
      );
      await tester.tap(find.text('Sign in with email'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 6600));
      expect(
        tester
            .widget<LythLoadingWordmark>(find.byType(LythLoadingWordmark))
            .active,
        isTrue,
      );
      expect(find.text('Signing in…'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Semantics &&
              widget.properties.liveRegion == true &&
              widget.properties.label == 'Signing in…',
        ),
        findsOneWidget,
      );
      if (outcome == 'disposed') {
        await tester.pumpWidget(const SizedBox.shrink());
      }
      if (outcome == 'error') {
        pending.completeError(StateError('Synthetic sign-in failure'));
      } else {
        pending.complete(
          User.fromJson({
            'id': '018f0000-0000-7000-8000-000000000001',
            'email': 'synthetic@example.invalid',
            'role': 'user',
            'tier': 'bronze',
            'created_at': '2026-08-01T00:00:00Z',
            'last_login_at': '2026-08-01T00:00:00Z',
          }),
        );
      }
      await tester.pumpAndSettle();
      expect(completed, outcome == 'success' ? 1 : 0);
      if (outcome != 'disposed') {
        expect(
          tester
              .widget<LythLoadingWordmark>(find.byType(LythLoadingWordmark))
              .active,
          isFalse,
        );
      }
      expect(tester.binding.transientCallbackCount, 0);
      expect(tester.takeException(), isNull);
    });
  }
  for (final outcome in ['timeout', 'error', 'disposed', 'blocked']) {
    testWidgets(
      'sign-in security preflight handles $outcome without a late login',
      (tester) async {
        final auth = _MockAuthService();
        final guard = _MockIntegrityGuard();
        final evaluation = Completer<DeviceIntegrityDecision>();
        when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
        when(
          () => guard.evaluate(IntegrityUseCase.signIn),
        ).thenAnswer((_) => evaluation.future);
        await tester.binding.setSurfaceSize(const Size(430, 950));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              analyticsClientProvider.overrideWithValue(
                const NullAnalyticsClient(),
              ),
              enhancedAuthServiceProvider.overrideWithValue(auth),
              deviceIntegrityGuardProvider.overrideWithValue(guard),
            ],
            child: const MaterialApp(home: AuthChoiceScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextField, 'Email'),
          'synthetic@example.invalid',
        );
        await tester.enterText(
          find.widgetWithText(TextField, 'Password'),
          'historical12',
        );
        await tester.tap(find.text('Sign in with email'));
        await tester.pump();
        expect(find.text('Signing in…'), findsOneWidget);
        await tester.tap(find.text('Signing in…'));
        verify(() => guard.evaluate(IntegrityUseCase.signIn)).called(1);
        if (outcome == 'disposed') {
          await tester.pumpWidget(const SizedBox.shrink());
          evaluation.complete(DeviceIntegrityDecision.allow());
        } else if (outcome == 'error') {
          evaluation.completeError(StateError('Synthetic device failure'));
        } else if (outcome == 'blocked') {
          evaluation.complete(
            DeviceIntegrityDecision.block('security.device_integrity_blocked'),
          );
        } else {
          await tester.pump(const Duration(seconds: 9));
          evaluation.complete(DeviceIntegrityDecision.allow());
        }
        await tester.pumpAndSettle();
        if (outcome == 'timeout' || outcome == 'error') {
          expect(
            find.text('The security check could not finish. Please try again.'),
            findsOneWidget,
          );
          expect(find.text('Sign in with email'), findsOneWidget);
        }
        if (outcome == 'blocked') {
          expect(find.text('Security Notice'), findsOneWidget);
          await tester.tap(find.text('OK'));
          await tester.pumpAndSettle();
        }
        verifyNever(() => auth.loginWithEmail(any(), any()));
        expect(tester.takeException(), isNull);
      },
    );
  }
  for (final action in [
    'Forgot password?',
    'Resend verification email',
    'Create account',
  ]) {
    for (final outcome in ['opened', 'unavailable', 'error']) {
      testWidgets(
        '$action reports $outcome without claiming an email was sent',
        (tester) async {
          final auth = _MockAuthService();
          when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
          final launches = <Uri>[];
          await tester.binding.setSurfaceSize(const Size(430, 950));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                analyticsClientProvider.overrideWithValue(
                  const NullAnalyticsClient(),
                ),
                enhancedAuthServiceProvider.overrideWithValue(auth),
              ],
              child: MaterialApp(
                home: AuthChoiceScreen(
                  launchAuthPage: (uri) async {
                    launches.add(uri);
                    if (outcome == 'error') throw StateError('Launch failed');
                    return outcome == 'opened';
                  },
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          if (action == 'Resend verification email') {
            await tester.tap(find.text('Verification & invites'));
            await tester.pumpAndSettle();
          }
          await tester.ensureVisible(find.text(action));
          await tester.tap(find.text(action));
          await tester.pumpAndSettle();
          expect(launches.single.scheme, 'https');
          expect(launches.single.host, 'lythaus.co');
          expect(
            launches.single.path,
            {
              'Forgot password?': '/forgot-password',
              'Resend verification email': '/resend-verification',
              'Create account': '/signup',
            }[action],
          );
          expect(
            find.byType(SnackBar),
            outcome == 'opened' ? findsNothing : findsOneWidget,
          );
          expect(find.text('Opening verification…'), findsNothing);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('invalid login is actionable and guest remains read-only', (
    tester,
  ) async {
    final auth = _MockAuthService();
    when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
    when(() => auth.logout()).thenAnswer((_) async {});
    await tester.binding.setSurfaceSize(const Size(430, 950));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in with email'));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter a valid email and your existing password.'),
      findsOneWidget,
    );
    verifyNever(() => auth.loginWithEmail(any(), any()));
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(find.byTooltip('Hide password'), findsOneWidget);
    await tester.tap(find.text('Continue as guest'));
    await tester.pumpAndSettle();
    verify(() => auth.logout()).called(1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders email and guest launch options', (tester) async {
    final authService = _MockAuthService();
    when(() => authService.getCurrentUser()).thenAnswer((_) async => null);
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(authService),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in with email'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
    expect(find.text('Resend verification email'), findsNothing);
    expect(find.text('Create account'), findsOneWidget);
    expect(find.text('Continue as guest'), findsOneWidget);
    await tester.tap(find.text('Verification & invites'));
    await tester.pumpAndSettle();
    expect(find.text('Resend verification email'), findsOneWidget);
    expect(find.text('Redeem invite'), findsOneWidget);
  });

  testWidgets('session restoration is distinct from submitting credentials', (
    tester,
  ) async {
    final auth = _MockAuthService();
    final restoration = Completer<User?>();
    when(() => auth.getCurrentUser()).thenAnswer((_) => restoration.future);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pump();
    expect(find.text('Checking your session…'), findsOneWidget);
    expect(find.text('Signing in…'), findsNothing);
    final emailBefore = tester.getRect(find.widgetWithText(TextField, 'Email'));
    await tester.tap(find.text('Sign in with email'));
    verifyNever(() => auth.loginWithEmail(any(), any()));
    restoration.complete(null);
    await tester.pumpAndSettle();
    expect(find.text('Checking your session…').hitTestable(), findsNothing);
    final semantics = tester.ensureSemantics();
    try {
      await tester.pump();
      expect(find.semantics.byLabel('Checking your session…'), findsNothing);
    } finally {
      semantics.dispose();
    }
    expect(
      tester.getRect(find.widgetWithText(TextField, 'Email')),
      emailBefore,
    );
    await tester.tap(find.text('Sign in with email'));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter a valid email and your existing password.'),
      findsOneWidget,
    );
  });

  testWidgets('external launch is single-flight and usable after return', (
    tester,
  ) async {
    final auth = _MockAuthService();
    when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
    var launch = Completer<bool>();
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: MaterialApp(
          home: AuthChoiceScreen(
            launchAuthPage: (_) {
              calls++;
              return launch.future;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Create account'));
    await tester.tap(find.text('Create account'));
    await tester.pump();
    await tester.tap(find.text('Create account'));
    expect(calls, 1);
    launch.complete(true);
    await tester.pumpAndSettle();
    launch = Completer<bool>();
    await tester.tap(find.text('Create account'));
    expect(calls, 2);
    launch.complete(false);
    await tester.pumpAndSettle();
    expect(find.text('Unable to open account creation.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mobile keyboard next and done keep sign-in reachable', (
    tester,
  ) async {
    final auth = _MockAuthService();
    when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.showKeyboard(find.widgetWithText(TextField, 'Email'));
    await tester.testTextInput.receiveAction(TextInputAction.next);
    await tester.pumpAndSettle();
    final password = tester.widget<EditableText>(
      find.descendant(
        of: find.widgetWithText(TextField, 'Password'),
        matching: find.byType(EditableText),
      ),
    );
    expect(password.focusNode.hasFocus, isTrue);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(
      find.text('Enter a valid email and your existing password.'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Sign in with email'));
    expect(find.text('Sign in with email').hitTestable(), findsOneWidget);
    verifyNever(() => auth.loginWithEmail(any(), any()));
    expect(tester.takeException(), isNull);
  });

  testWidgets('invite disclosure supports navigation and return with draft', (
    tester,
  ) async {
    final auth = _MockAuthService();
    when(() => auth.getCurrentUser()).thenAnswer((_) async => null);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(auth),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Email'),
      'draft@example.invalid',
    );
    await tester.ensureVisible(find.text('Verification & invites'));
    await tester.tap(find.text('Verification & invites'));
    await tester.pumpAndSettle();
    for (var attempt = 0; attempt < 2; attempt++) {
      await tester.ensureVisible(find.text('Redeem invite'));
      await tester.tap(find.text('Redeem invite'));
      await tester.pumpAndSettle();
      expect(find.text('Enter your invite code'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('draft@example.invalid'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';

import '../../../golden_test_utils.dart';

class _SignedOut extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _SignedOut() : super(const AsyncValue.data(null));

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Layout tests cannot authenticate');
}

class _PendingInvite implements InviteRedeemService {
  final result = Completer<void>();

  @override
  Future<void> redeemInvite({
    required String accessToken,
    required String inviteCode,
  }) => result.future;
}

Future<void> _pump(
  WidgetTester tester, {
  Size size = const Size(320, 568),
  double scale = 2,
  double keyboard = 0,
  bool dark = false,
  Widget home = const InviteRedeemScreen(),
  _PendingInvite? service,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        authStateProvider.overrideWith((_) => _SignedOut()),
        jwtProvider.overrideWith((_) async => 'synthetic-layout-session'),
        if (service != null)
          inviteRedeemServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp(
        theme: dark ? LythausTheme.dark() : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _revealAction(WidgetTester tester) async {
  await tester.ensureVisible(find.byType(LythButton));
  await tester.pumpAndSettle();
  expect(find.byType(LythButton).hitTestable(), findsOneWidget);
}

void main() {
  setUpAll(loadFontsForGoldenTests);

  for (final dark in [false, true]) {
    testWidgets('invite stays usable with 2x text and keyboard, dark=$dark', (
      tester,
    ) async {
      await _pump(tester, keyboard: 280, dark: dark);
      expect(tester.takeException(), isNull);
      await _revealAction(tester);
      await tester.tap(find.byType(LythButton));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Invite code is required.'), findsOneWidget);
      await _revealAction(tester);
      final action = tester.getRect(find.byType(LythButton));
      expect(action.height, greaterThanOrEqualTo(48));
      expect(action.bottom, lessThanOrEqualTo(568 - 280));
    });
  }

  testWidgets('error is announced and approved brand is named once', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester, size: const Size(390, 844), scale: 1);
    expect(find.byType(LythBrand), findsOneWidget);
    expect(find.bySemanticsLabel('Lythaus'), findsOneWidget);
    expect(
      tester
          .getSemantics(find.text('Enter your invite code'))
          .flagsCollection
          .isHeader,
      isTrue,
    );
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();
    final error = tester.getSemantics(find.text('Invite code is required.'));
    expect(error.flagsCollection.isLiveRegion, isTrue);
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    semantics.dispose();
  });

  testWidgets('invite draft survives resize and pause/resume', (tester) async {
    await _pump(tester, size: const Size(390, 844), scale: 1);
    await tester.enterText(find.byType(TextField), 'SYNTHETIC-INVITE');
    final controller = tester
        .widget<TextField>(find.byType(TextField))
        .controller;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.view.physicalSize = const Size(320, 568);
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller,
      same(controller),
    );
    expect(controller!.text, 'SYNTHETIC-INVITE');
    await _revealAction(tester);
  });

  testWidgets('Back returns to the existing sign-in draft', (tester) async {
    await _pump(
      tester,
      size: const Size(390, 844),
      scale: 1,
      home: const AuthChoiceScreen(),
    );
    await tester.enterText(
      find.byType(TextField).first,
      'draft@example.invalid',
    );
    await tester.enterText(find.byType(TextField).last, 'Synthetic draft only');
    await tester.ensureVisible(find.byType(ExpansionTile));
    await tester.tap(find.text('Verification & invites'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Redeem invite'));
    await tester.tap(find.text('Redeem invite'));
    await tester.pumpAndSettle();
    expect(find.byType(InviteRedeemScreen), findsOneWidget);
    expect(tester.getSize(find.byType(BackButton)), const Size(48, 48));
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(InviteRedeemScreen), findsNothing);
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'draft@example.invalid',
    );
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Synthetic draft only',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending action is disabled and announces progress', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final service = _PendingInvite();
    await _pump(tester, service: service);
    await tester.enterText(find.byType(TextField), 'SYNTHETIC-INVITE');
    await _revealAction(tester);
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();
    expect(
      tester.widget<LythButton>(find.byType(LythButton)).isLoading,
      isTrue,
    );
    expect(
      tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
      isNull,
    );
    final progress = tester.getSemantics(find.byType(LythButton));
    expect(progress.getSemanticsData().label, contains('Redeeming'));
    expect(progress.getSemanticsData().value, 'In progress');
    expect(progress.flagsCollection.isLiveRegion, isTrue);
    service.result.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}

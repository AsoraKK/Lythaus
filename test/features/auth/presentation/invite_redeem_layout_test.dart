import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';

Future<void> _pump(WidgetTester tester, {bool dark = false}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(320, 568);
  tester.view.viewInsets = const FakeViewPadding(bottom: 280);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      ],
      child: MaterialApp(
        theme: dark ? LythausTheme.dark() : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: const InviteRedeemScreen(inviteCode: 'SYNTHETIC-CODE'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      'signup form remains usable at 320px, 200% text and keyboard, dark=$dark',
      (tester) async {
        await _pump(tester, dark: dark);
        expect(tester.takeException(), isNull);
        expect(find.byType(LythBrand), findsOneWidget);
        expect(find.byType(TextField), findsNWidgets(3));
        await tester.ensureVisible(find.byType(LythButton));
        await tester.pumpAndSettle();
        expect(find.byType(LythButton).hitTestable(), findsOneWidget);
        await tester.tap(find.byType(LythButton));
        await tester.pumpAndSettle();
        expect(
          find.text('Enter the email address your invitation was sent to.'),
          findsOneWidget,
        );
        final action = tester.getRect(find.byType(LythButton));
        expect(action.height, greaterThanOrEqualTo(48));
        expect(
          action.bottom,
          lessThanOrEqualTo(tester.view.physicalSize.height),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('invite screen exposes a labelled heading and announced errors', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            analyticsClientProvider.overrideWithValue(
              const NullAnalyticsClient(),
            ),
          ],
          child: const MaterialApp(home: InviteRedeemScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(LythBrand), findsOneWidget);
      expect(
        tester
            .getSemantics(find.text('Enter your invite code'))
            .flagsCollection
            .isHeader,
        isTrue,
      );
      await tester.ensureVisible(find.byType(LythButton));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(LythButton));
      await tester.pumpAndSettle();
      expect(
        tester
            .getSemantics(
              find.text('Enter the email address your invitation was sent to.'),
            )
            .flagsCollection
            .isLiveRegion,
        isTrue,
      );
    } finally {
      semantics.dispose();
    }
  });
}

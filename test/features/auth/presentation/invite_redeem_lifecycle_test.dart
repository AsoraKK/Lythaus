import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';

class _PendingRedemption implements InviteRedeemService {
  final responses = <Completer<void>>[];

  @override
  Future<void> redeemInvite({
    required String accessToken,
    required String inviteCode,
  }) {
    expect(accessToken, 'synthetic-session');
    expect(inviteCode, 'SYNTHETIC-INVITE');
    final response = Completer<void>();
    responses.add(response);
    return response.future;
  }
}

class _PendingAnalytics extends NullAnalyticsClient {
  final response = Completer<void>();

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) {
    if (name == AnalyticsEvents.inviteScreenView) return Future.value();
    return response.future;
  }
}

Future<ProviderContainer> _openInvite(
  WidgetTester tester,
  _PendingRedemption service, {
  Future<String?>? token,
  AnalyticsClient analytics = const NullAnalyticsClient(),
}) async {
  final container = ProviderContainer(
    overrides: [
      jwtProvider.overrideWith(
        (_) => token ?? Future.value('synthetic-session'),
      ),
      inviteRedeemServiceProvider.overrideWithValue(service),
      analyticsClientProvider.overrideWithValue(analytics),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute(builder: (_) => const InviteRedeemScreen()),
              ),
              child: const Text('Open invite'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open invite'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField), 'SYNTHETIC-INVITE');
  await tester.tap(find.byType(LythButton));
  await tester.pumpAndSettle();
  return container;
}

void main() {
  for (final signedIn in [false, true]) {
    testWidgets(
      'Back during token lookup has no late side effects: $signedIn',
      (tester) async {
        final token = Completer<String?>();
        final service = _PendingRedemption();
        final container = await _openInvite(
          tester,
          service,
          token: token.future,
        );
        await tester.pageBack();
        await tester.pumpAndSettle();
        token.complete(signedIn ? 'synthetic-session' : null);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(service.responses, isEmpty);
        expect(container.read(pendingInviteCodeProvider), isNull);
        expect(find.text('Open invite'), findsOneWidget);
      },
    );
  }

  for (final outcome in ['success', 'dio', 'unknown']) {
    testWidgets('Back during redemption safely ignores late $outcome', (
      tester,
    ) async {
      final service = _PendingRedemption();
      await _openInvite(tester, service);
      expect(service.responses, hasLength(1));
      await tester.pageBack();
      await tester.pumpAndSettle();
      switch (outcome) {
        case 'success':
          service.responses.single.complete();
        case 'dio':
          service.responses.single.completeError(
            DioException(requestOptions: RequestOptions(path: '/synthetic')),
          );
        case 'unknown':
          service.responses.single.completeError(
            StateError('synthetic failure'),
          );
      }
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Open invite'), findsOneWidget);
      expect(find.text('Invite redeemed. Welcome to Lythaus.'), findsNothing);
    });
  }

  for (final success in [false, true]) {
    testWidgets('analytics cannot hold redemption UI pending: $success', (
      tester,
    ) async {
      final service = _PendingRedemption();
      final analytics = _PendingAnalytics();
      await _openInvite(tester, service, analytics: analytics);
      if (success) {
        service.responses.single.complete();
      } else {
        service.responses.single.completeError(StateError('synthetic failure'));
      }
      await tester.pumpAndSettle();
      if (success) {
        expect(find.text('Open invite'), findsOneWidget);
      } else {
        expect(
          find.text('Invite could not be redeemed. Please check the code.'),
          findsOneWidget,
        );
        expect(
          tester.widget<LythButton>(find.byType(LythButton)).isLoading,
          isFalse,
        );
        await tester.tap(find.byType(LythButton));
        await tester.pumpAndSettle();
        expect(service.responses, hasLength(2));
        service.responses.last.complete();
      }
      analytics.response.completeError(
        StateError('synthetic analytics failure'),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('repeated submit while pending sends one redemption', (
    tester,
  ) async {
    final service = _PendingRedemption();
    await _openInvite(tester, service);
    await tester.tap(find.byType(LythButton));
    await tester.pumpAndSettle();
    expect(service.responses, hasLength(1));
    service.responses.single.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

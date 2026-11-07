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

class _PendingInvite implements InviteRedeemService {
  final responses = <Completer<void>>[];

  @override
  Future<void> redeemInvite({
    required String email,
    required String inviteCode,
    required String password,
  }) {
    expect(email, 'tester@example.invalid');
    expect(inviteCode, 'SYNTHETIC-INVITE');
    expect(password, 'synthetic-password-123');
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

Future<void> _openInvite(
  WidgetTester tester,
  _PendingInvite service, {
  AnalyticsClient analytics = const NullAnalyticsClient(),
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        inviteRedeemServiceProvider.overrideWithValue(service),
        analyticsClientProvider.overrideWithValue(analytics),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      const InviteRedeemScreen(inviteCode: 'SYNTHETIC-INVITE'),
                ),
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
  await tester.enterText(
    find.byType(TextField).at(0),
    'tester@example.invalid',
  );
  await tester.enterText(
    find.byType(TextField).at(2),
    'synthetic-password-123',
  );
  await tester.ensureVisible(find.byType(LythButton));
  await tester.pumpAndSettle();
  await tester.tap(find.byType(LythButton));
  // The deliberately pending request keeps the submit spinner animating.
  await tester.pump();
}

void main() {
  testWidgets('leaving while signup is pending ignores its late response', (
    tester,
  ) async {
    final service = _PendingInvite();
    await _openInvite(tester, service);
    expect(service.responses, hasLength(1));
    await tester.pageBack();
    await tester.pumpAndSettle();
    service.responses.single.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Open invite'), findsOneWidget);
    expect(
      find.text(
        'Your email is verified and your account is ready. Sign in with your email and password.',
      ),
      findsNothing,
    );
  });

  testWidgets('analytics failure cannot keep a successful signup pending', (
    tester,
  ) async {
    final service = _PendingInvite();
    final analytics = _PendingAnalytics();
    await _openInvite(tester, service, analytics: analytics);
    service.responses.single.complete();
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Your email is verified and your account is ready. Sign in with your email and password.',
      ),
      findsOneWidget,
    );
    analytics.response.completeError(StateError('synthetic analytics failure'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('duplicate taps while request is pending send once', (
    tester,
  ) async {
    final service = _PendingInvite();
    await _openInvite(tester, service);
    await tester.tap(find.byType(LythButton));
    await tester.pump();
    expect(service.responses, hasLength(1));
    service.responses.single.completeError(
      DioException(
        requestOptions: RequestOptions(path: '/api/auth/email/verify'),
      ),
    );
    await tester.pumpAndSettle();
    expect(service.responses, hasLength(1));
    expect(tester.takeException(), isNull);
  });
}

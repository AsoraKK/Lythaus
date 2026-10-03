import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_consent_storage.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'test_doubles.dart';

User user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class SyntheticAuth extends Mock implements AuthService {}

class SyntheticAnalytics extends Mock implements AnalyticsClient {}

Future<ProviderContainer> open(
  WidgetTester tester,
  TestPrivacyApi api, {
  bool consentAware = false,
}) async {
  await tester.binding.setSurfaceSize(const Size(1200, 1800));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final auth = SyntheticAuth();
  when(() => auth.getCurrentUser()).thenAnswer((_) async => user('a'));
  when(() => auth.getJwtToken()).thenAnswer((_) async => 'synthetic-token');
  when(() => auth.logout()).thenAnswer((_) async {});
  when(() => auth.remoteLogoutConfirmed).thenReturn(true);
  final analytics = SyntheticAnalytics();
  when(
    () => analytics.logEvent(any(), properties: any(named: 'properties')),
  ).thenAnswer((_) async {});
  final storage = MemoryPrivacyStorage();
  final container = ProviderContainer(
    overrides: [
      enhancedAuthServiceProvider.overrideWithValue(auth),
      privacyApiProvider.overrideWithValue(api),
      secureStorageProvider.overrideWithValue(storage),
      analyticsConsentStorageProvider.overrideWithValue(
        AnalyticsConsentStorage(storage: storage),
      ),
      analyticsClientProvider.overrideWith(
        (ref) => consentAware && ref.watch(analyticsConsentProvider).enabled
            ? analytics
            : const NullAnalyticsClient(),
      ),
    ],
  );
  addTearDown(container.dispose);
  container.read(authStateProvider.notifier);
  for (var i = 0; i < 8; i++) {
    await Future<void>.value();
  }
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: PrivacySettingsScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets(
    'stale typed deletion dialog cannot affect a replacement account',
    (tester) async {
      final api = TestPrivacyApi();
      final container = await open(tester, api);
      final button = find.text('Request account deletion');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(LythTextField), 'DELETE');
      await tester.pump();
      final auth = container.read(authStateProvider.notifier);
      final leaving = auth.signOut();
      auth.setUser(user('b'));
      await leaving;
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete', skipOffstage: false));
      await tester.pumpAndSettle();
      expect(api.deleteCalls, 0);
      expect(container.read(currentUserProvider)?.id, 'b');
      expect(container.read(privacyControllerProvider).deleteRequestId, isNull);
    },
  );
  testWidgets(
    'analytics consent change preserves confirmed privacy status within the same session',
    (tester) async {
      final api = TestPrivacyApi();
      final container = await open(tester, api, consentAware: true);
      final old = container.read(privacyControllerProvider.notifier);
      expect(
        container.read(privacyControllerProvider).canRequestExport,
        isTrue,
      );
      final statusReads = api.statusCalls;
      await container
          .read(analyticsConsentProvider.notifier)
          .grantConsent(ConsentSource.privacySettings);
      await tester.pumpAndSettle();
      final current = container.read(privacyControllerProvider.notifier);
      final state = container.read(privacyControllerProvider);
      expect(state.exportStatus, ExportStatus.idle);
      expect(state.canRequestExport, isTrue);
      expect(current, same(old));
      expect(api.statusCalls, statusReads);
      final enabled = container.read(analyticsClientProvider);
      await current.export();
      verify(
        () => enabled.logEvent(AnalyticsEvents.privacyExportRequested),
      ).called(1);
      expect(api.exportCalls, 1);
      await container
          .read(analyticsConsentProvider.notifier)
          .revokeConsent(ConsentSource.privacySettings);
      await tester.pumpAndSettle();
      expect(container.read(privacyControllerProvider.notifier), same(old));
      expect(
        container.read(privacyControllerProvider).exportStatus,
        ExportStatus.received,
      );
      await current.delete();
      expect(api.deleteCalls, 1);
      verifyNever(
        () => enabled.logEvent(AnalyticsEvents.privacyDeleteRequested),
      );
    },
  );
}

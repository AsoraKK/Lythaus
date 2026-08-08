import 'dart:async';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_consent_storage.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/analytics/consent_aware_analytics_client.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeConsentStorage extends AnalyticsConsentStorage {
  _FakeConsentStorage(this.consent)
    : super(storage: const FlutterSecureStorage());

  AnalyticsConsent consent;
  final Completer<void> loadCompleter = Completer<void>();
  int saveCalls = 0;
  int clearCalls = 0;

  @override
  Future<AnalyticsConsent> load() async {
    if (!loadCompleter.isCompleted) {
      loadCompleter.complete();
    }
    return consent;
  }

  Future<void> waitForLoad() async {
    await loadCompleter.future;
    await Future<void>.delayed(Duration.zero);
  }

  @override
  Future<void> save(AnalyticsConsent consent) async {
    this.consent = consent;
    saveCalls++;
  }

  @override
  Future<void> clear() async {
    clearCalls++;
    consent = AnalyticsConsent.defaultConsent();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('AnalyticsConsentNotifier loads consent from storage', () async {
    final storage = _FakeConsentStorage(
      AnalyticsConsent(
        enabled: true,
        updatedAt: DateTime.utc(2024, 1, 1),
        source: ConsentSource.onboarding,
        policyVersion: 1,
      ),
    );

    final container = ProviderContainer(
      overrides: [analyticsConsentStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final state = container.read(analyticsConsentProvider);
    expect(state.enabled, isTrue);
    expect(state.source, ConsentSource.onboarding);
  });

  test('grantConsent updates state and persists', () async {
    final storage = _FakeConsentStorage(AnalyticsConsent.defaultConsent());
    final container = ProviderContainer(
      overrides: [analyticsConsentStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final notifier = container.read(analyticsConsentProvider.notifier);
    await notifier.grantConsent(ConsentSource.privacySettings);

    final state = container.read(analyticsConsentProvider);
    expect(state.enabled, isTrue);
    expect(storage.saveCalls, 1);
  });

  test('revokeConsent updates state and persists', () async {
    final storage = _FakeConsentStorage(AnalyticsConsent.defaultConsent());
    final container = ProviderContainer(
      overrides: [analyticsConsentStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final notifier = container.read(analyticsConsentProvider.notifier);
    await notifier.revokeConsent(ConsentSource.onboarding);

    final state = container.read(analyticsConsentProvider);
    expect(state.enabled, isFalse);
    expect(storage.saveCalls, 1);
  });

  test('clearConsent resets state and clears storage', () async {
    final storage = _FakeConsentStorage(
      AnalyticsConsent(
        enabled: true,
        updatedAt: DateTime.utc(2024, 1, 1),
        source: ConsentSource.onboarding,
        policyVersion: 1,
      ),
    );
    final container = ProviderContainer(
      overrides: [analyticsConsentStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final notifier = container.read(analyticsConsentProvider.notifier);
    await notifier.clearConsent();

    final state = container.read(analyticsConsentProvider);
    expect(state.enabled, isFalse);
    expect(storage.clearCalls, 1);
  });

  test('analyticsClientProvider respects consent state', () async {
    final storage = _FakeConsentStorage(AnalyticsConsent.defaultConsent());
    final container = ProviderContainer(
      overrides: [
        analyticsConsentStorageProvider.overrideWithValue(storage),
        httpClientProvider.overrideWithValue(Dio()),
      ],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final initialClient = container.read(analyticsClientProvider);
    expect(initialClient, isA<NullAnalyticsClient>());

    await container
        .read(analyticsConsentProvider.notifier)
        .grantConsent(ConsentSource.onboarding);
    final enabledClient = container.read(analyticsClientProvider);
    expect(enabledClient, isA<ConsentAwareAnalyticsClient>());
  });

  test('analyticsClientProvider can build with shared HTTP provider', () async {
    final storage = _FakeConsentStorage(
      AnalyticsConsent(
        enabled: true,
        updatedAt: DateTime.utc(2024, 1, 1),
        source: ConsentSource.onboarding,
        policyVersion: 1,
      ),
    );
    final container = ProviderContainer(
      overrides: [analyticsConsentStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);

    container.read(analyticsConsentProvider);
    await storage.waitForLoad();

    final enabledClient = container.read(analyticsClientProvider);
    expect(enabledClient, isA<ConsentAwareAnalyticsClient>());
  });
}

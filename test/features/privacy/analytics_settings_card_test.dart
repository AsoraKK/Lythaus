import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_consent_storage.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/privacy/widgets/analytics_settings_card.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
  final launcherCalls = <MethodCall>[];

  setUp(() {
    launcherCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(launcherChannel, (call) async {
          launcherCalls.add(call);
          if (call.method == 'canLaunch' || call.method == 'canLaunchUrl') {
            return true;
          }
          if (call.method == 'launch' || call.method == 'launchUrl') {
            return true;
          }
          return true;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(launcherChannel, null);
  });

  testWidgets('switch enable logs analytics consent event', (tester) async {
    final analytics = _RecordingAnalyticsClient();
    final initialConsent = AnalyticsConsent(
      enabled: false,
      updatedAt: DateTime.utc(2024, 1, 1, 12),
      source: ConsentSource.unknown,
    );

    await tester.pumpWidget(
      _buildHarness(initialConsent: initialConsent, analytics: analytics),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(analytics.events.length, 1);
    final event = analytics.events.single;
    expect(event.name, AnalyticsEvents.analyticsConsentChanged);
    expect(event.properties[AnalyticsEvents.propEnabled], true);
    expect(event.properties[AnalyticsEvents.propSource], 'privacy_settings');
  });

  testWidgets('switch disable logs analytics consent event', (tester) async {
    final analytics = _RecordingAnalyticsClient();
    final initialConsent = AnalyticsConsent(
      enabled: true,
      updatedAt: DateTime.utc(2024, 1, 1, 12),
      source: ConsentSource.privacySettings,
    );

    await tester.pumpWidget(
      _buildHarness(initialConsent: initialConsent, analytics: analytics),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(analytics.events.length, 1);
    final event = analytics.events.single;
    expect(event.name, AnalyticsEvents.analyticsConsentChanged);
    expect(event.properties[AnalyticsEvents.propEnabled], false);
    expect(event.properties[AnalyticsEvents.propSource], 'privacy_settings');
  });

  testWidgets('policy buttons trigger launcher calls', (tester) async {
    final analytics = _RecordingAnalyticsClient();
    final initialConsent = AnalyticsConsent(
      enabled: false,
      updatedAt: DateTime.utc(2024, 1, 1, 12),
      source: ConsentSource.unknown,
    );

    await tester.pumpWidget(
      _buildHarness(initialConsent: initialConsent, analytics: analytics),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Privacy Policy'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Terms of Service'));
    await tester.pumpAndSettle();

    expect(
      launcherCalls.where((call) => call.method.contains('launch')).isNotEmpty,
      isTrue,
    );
  });
}

Widget _buildHarness({
  required AnalyticsConsent initialConsent,
  required AnalyticsClient analytics,
}) {
  return ProviderScope(
    overrides: [
      analyticsConsentProvider.overrideWith((ref) {
        return AnalyticsConsentNotifier(
          storage: _StaticConsentStorage(initialConsent),
        );
      }),
      analyticsClientProvider.overrideWithValue(analytics),
    ],
    child: const MaterialApp(home: Scaffold(body: AnalyticsSettingsCard())),
  );
}

class _StaticConsentStorage extends AnalyticsConsentStorage {
  _StaticConsentStorage(this._consent);

  final AnalyticsConsent _consent;

  @override
  Future<AnalyticsConsent> load() async => _consent;

  @override
  Future<void> save(AnalyticsConsent consent) async {}

  @override
  Future<void> clear() async {}
}

class _RecordedEvent {
  _RecordedEvent(this.name, this.properties);

  final String name;
  final Map<String, Object?> properties;
}

class _RecordingAnalyticsClient implements AnalyticsClient {
  final List<_RecordedEvent> events = [];

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    events.add(_RecordedEvent(name, properties ?? const {}));
  }

  @override
  Future<void> reset() async {}

  @override
  Future<void> setUserId(String? userId) async {}

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {}
}

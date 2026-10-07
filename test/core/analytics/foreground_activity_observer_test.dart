import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';
import 'package:lythaus/core/analytics/foreground_activity_observer.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'activity_measurement_fixture.dart';

class _SessionSource extends StateNotifier<Object?> {
  _SessionSource() : super(null);
}

Widget _harness(PilotClient client, bool enabled) => ProviderScope(
  overrides: [
    activityPilotEnabledProvider.overrideWithValue(enabled),
    activityMeasurementClientProvider.overrideWithValue(client),
    activityMeasurementControllerProvider.overrideWith(
      (ref) => ActivityMeasurementController(
        client: client,
        collectionEnabled: enabled,
      ),
    ),
    authSessionRevisionProvider.overrideWith(
      (ref) => AuthSessionRevision(_SessionSource()),
    ),
  ],
  child: const MaterialApp(
    home: ForegroundActivityObserver(
      child: Scaffold(body: Text('Empty feed — synthetic test')),
    ),
  ),
);

void main() {
  testWidgets(
    'disabled build schedules no activity or automatic consent request',
    (tester) async {
      final client = PilotClient();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(_harness(client, false));
      await tester.pumpAndSettle();
      expect(client.reads, 0);
      expect(client.renders, 0);
    },
  );

  testWidgets(
    'empty visible feed counts; background states and arbitrary rebuilds do not',
    (tester) async {
      final client = PilotClient();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(_harness(client, true));
      await tester.pumpAndSettle();
      expect(find.text('Empty feed — synthetic test'), findsOneWidget);
      expect(client.renders, 1);
      await tester.pump();
      await tester.pump(const Duration(minutes: 5));
      expect(client.renders, 1);
      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
        await tester.pump();
        expect(client.renders, 1);
      }
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(
        client.renders,
        2,
      ); // Server canonical account/day deduplication applies.
    },
  );

  testWidgets(
    'a scheduled render is dropped if visibility is lost before the frame',
    (tester) async {
      final client = PilotClient();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pumpWidget(_harness(client, true));
      await tester.pumpAndSettle();
      expect(client.renders, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      await tester.pumpAndSettle();
      expect(client.renders, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    },
  );
}

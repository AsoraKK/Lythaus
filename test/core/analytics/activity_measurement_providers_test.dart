import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';
import 'activity_measurement_fixture.dart';

void main() {
  test(
    'disabled build does not read or render; existing consent can withdraw',
    () async {
      final client = PilotClient();
      final controller = ActivityMeasurementController(
        client: client,
        collectionEnabled: false,
      );
      addTearDown(controller.dispose);
      await controller.visibleForegroundRender();
      expect(client.reads, 0);
      expect(client.renders, 0);
      await controller.refresh();
      await controller.setConsent(true);
      expect(client.choices, isEmpty);
      await controller.setConsent(false);
      expect(client.choices, [false]);
      expect(controller.state.consent!.granted, false);
    },
  );

  test('unknown or refused consent never collects', () async {
    final client = PilotClient()
      ..consent = const ActivityConsentRecord(
        pilotEnabled: true,
        granted: false,
        revision: 0,
        epoch: null,
        accountScope: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      );
    final controller = ActivityMeasurementController(
      client: client,
      collectionEnabled: true,
    );
    addTearDown(controller.dispose);
    await controller.visibleForegroundRender();
    await Future<void>.delayed(Duration.zero);
    await controller.visibleForegroundRender();
    expect(client.renders, 0);
    await controller.setConsent(true);
    await controller.visibleForegroundRender();
    expect(client.renders, 1);
  });

  test(
    'failed withdrawal pauses locally without claiming server withdrawal',
    () async {
      final client = PilotClient()..failConsent = true;
      final controller = ActivityMeasurementController(
        client: client,
        collectionEnabled: true,
      );
      addTearDown(controller.dispose);
      await Future<void>.delayed(Duration.zero);
      await controller.setConsent(false);
      expect(controller.state.consent!.granted, true);
      expect(controller.state.paused, true);
      expect(controller.state.error, contains('another device'));
      await controller.visibleForegroundRender();
      expect(client.renders, 0);
      expect(client.cancellations, 1);
      client.failConsent = false;
      await controller.setConsent(false);
      expect(controller.state.consent!.granted, false);
    },
  );

  test(
    'render overlap is bounded; source failure pauses until confirmed refresh',
    () async {
      final client = PilotClient()..pendingRender = Completer<String>();
      final controller = ActivityMeasurementController(
        client: client,
        collectionEnabled: true,
      );
      addTearDown(controller.dispose);
      await Future<void>.delayed(Duration.zero);
      final first = controller.visibleForegroundRender();
      await controller.visibleForegroundRender();
      expect(client.renders, 1);
      client.pendingRender!.complete('2026-10-07');
      await first;
      client.pendingRender = null;
      client.failRender = true;
      await controller.visibleForegroundRender();
      expect(controller.state.paused, true);
      client.failRender = false;
      await controller.refresh();
      expect(controller.state.paused, false);
      await controller.visibleForegroundRender();
      expect(client.renders, 3);
    },
  );

  test(
    'session change discards delayed consent response, including A-null-A revision',
    () async {
      var sessionRevision = 0;
      final client = PilotClient()
        ..pendingConsent = Completer<ActivityConsentRecord>();
      final controller = ActivityMeasurementController(
        client: client,
        collectionEnabled: true,
        isCurrentSession: () => sessionRevision == 0,
      );
      addTearDown(controller.dispose);
      await Future<void>.delayed(Duration.zero);
      final write = controller.setConsent(false);
      sessionRevision = 2;
      controller.cancelPendingSession();
      client.pendingConsent!.complete(
        const ActivityConsentRecord(
          pilotEnabled: true,
          granted: false,
          revision: 2,
          epoch: '22222222-2222-4222-8222-222222222222',
          accountScope: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        ),
      );
      await write;
      expect(controller.state.consent!.granted, true);
      await controller.visibleForegroundRender();
      expect(client.renders, 0);
    },
  );
}

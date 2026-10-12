import 'dart:async';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';

const pilotConsent = ActivityConsentRecord(
  pilotEnabled: true,
  granted: true,
  revision: 1,
  epoch: '11111111-1111-4111-8111-111111111111',
  accountScope: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
);

class PilotClient implements ActivityMeasurementClient {
  ActivityConsentRecord consent = pilotConsent;
  int reads = 0;
  int renders = 0;
  int cancellations = 0;
  final choices = <bool>[];
  bool failStatus = false;
  bool failConsent = false;
  bool failRender = false;
  Completer<ActivityConsentRecord>? pendingConsent;
  Completer<String>? pendingRender;

  @override
  Future<ActivityConsentRecord> status() async {
    reads++;
    if (failStatus) {
      throw const ActivityMeasurementFailure('source_unavailable');
    }
    return consent;
  }

  @override
  Future<ActivityConsentRecord> setConsent(
    ActivityConsentRecord current, {
    required bool enabled,
  }) async {
    choices.add(enabled);
    if (failConsent) {
      throw const ActivityMeasurementFailure('source_unavailable');
    }
    if (pendingConsent != null) return pendingConsent!.future;
    consent = ActivityConsentRecord(
      pilotEnabled: current.pilotEnabled,
      granted: enabled,
      revision: current.revision + 1,
      epoch: '22222222-2222-4222-8222-222222222222',
      accountScope: current.accountScope,
    );
    return consent;
  }

  @override
  Future<String> recordForegroundRender(ActivityConsentRecord current) async {
    renders++;
    if (failRender) {
      throw const ActivityMeasurementFailure('source_unavailable');
    }
    return pendingRender?.future ?? Future.value('2026-10-07');
  }

  @override
  void cancelRenders() {
    cancellations++;
  }

  @override
  void cancelPending() {
    cancellations++;
  }
}

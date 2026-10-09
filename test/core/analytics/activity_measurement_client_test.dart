import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';
import 'activity_measurement_fixture.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final FutureOr<ResponseBody> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object value, [int status = 200]) => ResponseBody.fromString(
  jsonEncode(value),
  status,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
  },
);
Map<String, Object?> _consent() => {
  'pilotEnabled': true,
  'granted': true,
  'revision': 1,
  'epoch': pilotConsent.epoch,
  'accountScope': pilotConsent.accountScope,
  'noticeVersion': activityNoticeVersion,
  'notice': activityMeasurementNotice,
  'retentionDays': 61,
};

void main() {
  test(
    'session cancellation while awaiting a token sends no request',
    () async {
      final token = Completer<String?>();
      final adapter = _Adapter((_) => _json(_consent()));
      final client = DioActivityMeasurementClient(
        dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter,
        isCurrentSession: () => true,
        readAuthToken: () => token.future,
      );
      final response = client.status();
      client.cancelPending();
      await expectLater(response, throwsA(isA<ActivityMeasurementFailure>()));
      token.complete('old-synthetic-token');
      expect(adapter.requests, isEmpty);
    },
  );
  test(
    'exact account-linked notice required; anonymous notice and inconsistent state rejected',
    () {
      expect(ActivityConsentRecord.fromJson(_consent()).granted, true);
      for (final change in [
        {'notice': 'anonymous'},
        {'noticeVersion': 'anonymous-v1'},
        {'retentionDays': 60},
        {'revision': 0, 'epoch': null},
        {'accountScope': 'raw-account-id'},
        {'granted': 'true'},
      ]) {
        expect(
          () => ActivityConsentRecord.fromJson({..._consent(), ...change}),
          throwsA(isA<ActivityMeasurementFailure>()),
        );
      }
    },
  );

  test(
    'visible render payload has no content, URL, timestamp or account identity',
    () async {
      final adapter = _Adapter(
        (_) => _json({'activeDay': '2026-10-07', 'inserted': true}),
      );
      final client = DioActivityMeasurementClient(
        dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter,
        isCurrentSession: () => true,
        readAuthToken: () async => 'synthetic-token',
      );
      expect(await client.recordForegroundRender(pilotConsent), '2026-10-07');
      final request = adapter.requests.single;
      expect(request.path, '/api/analytics/activity');
      expect(request.method, 'POST');
      expect(request.headers['Authorization'], 'Bearer synthetic-token');
      expect(request.data, {
        'signal': 'foreground_app_render',
        'consentRevision': 1,
        'consentEpoch': pilotConsent.epoch,
        'accountScope': pilotConsent.accountScope,
        'noticeVersion': activityNoticeVersion,
      });
    },
  );

  test(
    'explicit consent writes compare revision, epoch and server-issued account scope',
    () async {
      final adapter = _Adapter((_) => _json(_consent()));
      final client = DioActivityMeasurementClient(
        dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter,
        isCurrentSession: () => true,
        readAuthToken: () async => 'synthetic-token',
      );
      await client.setConsent(pilotConsent, enabled: false);
      expect(adapter.requests.single.data, {
        'enabled': false,
        'expectedRevision': 1,
        'expectedEpoch': pilotConsent.epoch,
        'accountScope': pilotConsent.accountScope,
        'noticeVersion': activityNoticeVersion,
      });
    },
  );

  test(
    'delayed old-session response is discarded and no next request is sent',
    () async {
      var current = true;
      final pending = Completer<ResponseBody>();
      final adapter = _Adapter((_) => pending.future);
      final client = DioActivityMeasurementClient(
        dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter,
        isCurrentSession: () => current,
        readAuthToken: () async => 'synthetic-token',
      );
      final response = client.status();
      await Future<void>.delayed(Duration.zero);
      current = false;
      pending.complete(_json(_consent()));
      await expectLater(
        response,
        throwsA(
          isA<ActivityMeasurementFailure>().having(
            (e) => e.code,
            'code',
            'session_changed',
          ),
        ),
      );
      await expectLater(
        client.status(),
        throwsA(isA<ActivityMeasurementFailure>()),
      );
      expect(adapter.requests, hasLength(1));
    },
  );

  for (final status in [401, 409, 429, 503]) {
    test(
      'HTTP $status remains a sanitized failure without server response details',
      () async {
        final adapter = _Adapter(
          (_) => _json({'private': 'synthetic forbidden detail'}, status),
        );
        final client = DioActivityMeasurementClient(
          dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
            ..httpClientAdapter = adapter,
          isCurrentSession: () => true,
          readAuthToken: () async => 'synthetic-token',
        );
        await expectLater(
          client.status(),
          throwsA(isA<ActivityMeasurementFailure>()),
        );
      },
    );
  }

  test(
    'invalid UTC calendar dates are not accepted as recorded dates',
    () async {
      final adapter = _Adapter(
        (_) => _json({'activeDay': '2026-02-30', 'inserted': false}),
      );
      final client = DioActivityMeasurementClient(
        dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid'))
          ..httpClientAdapter = adapter,
        isCurrentSession: () => true,
        readAuthToken: () async => 'synthetic-token',
      );
      await expectLater(
        client.recordForegroundRender(pilotConsent),
        throwsA(isA<ActivityMeasurementFailure>()),
      );
    },
  );
}

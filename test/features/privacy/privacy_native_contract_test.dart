import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final ResponseBody Function(RequestOptions) respond;
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

Map<String, Object?> _request(String state) => {
  'requestId': 'synthetic-export',
  'requestType': 'export',
  'state': state,
  'acceptedAt': '2026-10-02T12:00:00.001Z',
  'completedAt': state == 'completed' ? '2026-10-02T12:30:00Z' : null,
};

void main() {
  late _Adapter adapter;
  DioPrivacyApi api(ResponseBody Function(RequestOptions) respond) {
    adapter = _Adapter(respond);
    return DioPrivacyApi(
      dio: Dio(BaseOptions(baseUrl: 'https://synthetic.invalid/api'))
        ..httpClientAdapter = adapter,
      logger: AppLogger(),
    );
  }

  for (final state in [
    'received',
    'processing',
    'blocked',
    'completed',
    'failed',
    'future_state',
  ]) {
    test('$state remains distinct from the 29-day cooldown', () async {
      final client = api(
        (_) => _json({
          'request': _request(state),
          'retryAfterSeconds': 29 * 86400,
        }),
      );
      final result = await client.getExportStatus(authToken: 'synthetic-a');
      expect(result.state, state);
      expect(result.requestId, 'synthetic-export');
      expect(result.retryAfterSeconds, 29 * 86400);
      expect(result.canRequest, isFalse);
      expect(
        adapter.requests.single.uri.queryParameters['requestType'],
        'export',
      );
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer synthetic-a',
      );
      expect(
        adapter.requests.single.headers.containsKey('Idempotency-Key'),
        isFalse,
      );
    });
  }

  for (final cooldown in [null, 0, 1]) {
    test(
      'completed export requires an explicit zero cooldown: $cooldown',
      () async {
        final client = api(
          (_) => _json({
            'request': _request('completed'),
            if (cooldown != null) 'retryAfterSeconds': cooldown,
          }),
        );
        final result = await client.getExportStatus(authToken: 'synthetic-a');
        expect(result.canRequest, cooldown == 0);
        expect(result.completedAt, DateTime.utc(2026, 10, 2, 12, 30));
      },
    );
  }

  for (final value in [-1, '0', 0.5]) {
    test('malformed cooldown $value cannot authorize an export', () async {
      final client = api(
        (_) => _json({
          'request': _request('completed'),
          'retryAfterSeconds': value,
        }),
      );
      await expectLater(
        client.getExportStatus(authToken: 'synthetic-a'),
        throwsA(isA<PrivacyApiException>()),
      );
    });
  }

  test('empty history is authoritative, while 404 is unavailable', () async {
    final client = api((_) => _json({'request': null, 'retryAfterSeconds': 0}));
    final result = await client.getExportStatus(authToken: 'synthetic-a');
    expect(result.requestState, PrivacyRequestState.idle);
    expect(result.canRequest, isTrue);
    final unavailable = api((_) => _json({'error': 'unavailable'}, 404));
    await expectLater(
      unavailable.getExportStatus(authToken: 'synthetic-a'),
      throwsA(isA<PrivacyApiException>()),
    );
  });

  test(
    'deletion submission is asynchronous and sends no hard-delete bypass',
    () async {
      final client = api(
        (_) => _json({..._request('received'), 'requestType': 'delete'}, 202),
      );
      final result = await client.deleteAccount(authToken: 'synthetic-a');
      expect(result.requestState, PrivacyRequestState.received);
      expect(adapter.requests.single.data, {'requestType': 'delete'});
      expect(
        adapter.requests.single.headers['Idempotency-Key'],
        startsWith('privacy-'),
      );
    },
  );

  test(
    'wrong request type and malformed acknowledgement remain unavailable',
    () async {
      final client = api(
        (_) => _json({
          'request': {..._request('completed'), 'requestType': 'delete'},
          'retryAfterSeconds': 0,
        }),
      );
      await expectLater(
        client.getExportStatus(authToken: 'synthetic-a'),
        throwsA(isA<PrivacyApiException>()),
      );
      final malformed = api(
        (_) => _json({'requestId': 3, 'acceptedAt': 9}, 202),
      );
      await expectLater(
        malformed.requestExport(authToken: 'synthetic-a'),
        throwsA(isA<PrivacyApiException>()),
      );
    },
  );

  test(
    'download returns verified bytes using owner bearer auth without a query token',
    () async {
      final bytes = utf8.encode('{"syntheticOwner":"a"}');
      final client = api(
        (_) => ResponseBody.fromBytes(
          bytes,
          200,
          headers: {
            'x-content-sha256': [sha256.convert(bytes).toString()],
          },
        ),
      );
      expect(
        await client.downloadExport(
          authToken: 'synthetic-a',
          requestId: 'request-a',
        ),
        bytes,
      );
      final request = adapter.requests.single;
      expect(request.path, endsWith('/privacy/requests/request-a/export'));
      expect(request.queryParameters, isEmpty);
      expect(request.headers['Authorization'], 'Bearer synthetic-a');
      expect(request.headers.containsKey('Idempotency-Key'), isFalse);
    },
  );

  for (final hash in [
    null,
    'wrong',
    sha256.convert(utf8.encode('different')).toString(),
  ]) {
    test(
      'missing or mismatched digest rejects downloaded bytes: $hash',
      () async {
        final client = api(
          (_) => ResponseBody.fromBytes(
            utf8.encode('{}'),
            200,
            headers: {
              if (hash != null) 'x-content-sha256': [hash],
            },
          ),
        );
        await expectLater(
          client.downloadExport(
            authToken: 'synthetic-a',
            requestId: 'request-a',
          ),
          throwsA(isA<PrivacyApiException>()),
        );
      },
    );
  }

  test(
    'missing authentication is rejected before every privacy transport',
    () async {
      final client = api((_) => _json({'request': null}));
      for (final action in [
        () => client.getExportStatus(authToken: ''),
        () => client.getDeleteStatus(authToken: ' '),
        () => client.requestExport(authToken: ''),
        () => client.deleteAccount(authToken: ''),
        () => client.downloadExport(authToken: '', requestId: 'request-a'),
      ]) {
        await expectLater(
          action(),
          throwsA(
            isA<PrivacyApiException>().having(
              (e) => e.type,
              'type',
              PrivacyErrorType.unauthorized,
            ),
          ),
        );
      }
      expect(adapter.requests, isEmpty);
    },
  );
}

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

class SyntheticTransport implements HttpClientAdapter {
  SyntheticTransport(this.response);
  final ResponseBody Function(RequestOptions) response;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return response(options);
  }

  @override
  void close({bool force = false}) {}
}

Map<String, Object?> legacyMonthly() => {
  'state': 'ready',
  'effectiveMonth': '2027-01',
  'currentLevel': 5,
  'sourceMonth': '2026-12',
  'sourceScore': 13500,
  'snapshot': {'state': 'confirmed'},
  'selection': {'state': 'unavailable'},
};

ResponseBody jsonResponse(Object? body, {int status = 200}) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
        'cache-control': ['private, no-store'],
      },
    );

LythausApiClient syntheticClient(SyntheticTransport transport) {
  final client = LythausApiClient(
    basePathOverride: 'https://synthetic.invalid',
  );
  client.dio.httpClientAdapter = transport;
  client.setBearerAuth('bearerAuth', 'synthetic-sdk-owner');
  addTearDown(() => client.dio.close());
  return client;
}

void main() {
  test(
    'canonical SDK rejects unauthorized monthly replies without returning authority',
    () async {
      final transport = SyntheticTransport(
        (_) => jsonResponse({'error': 'synthetic_unauthorized'}, status: 401),
      );
      final client = syntheticClient(transport);
      await expectLater(
        client.getRewardsApi().getMyMonthlyRewards(),
        throwsA(
          isA<DioException>().having(
            (error) => error.response?.statusCode,
            'synthetic HTTP status',
            401,
          ),
        ),
      );
      expect(transport.requests, hasLength(1));
      expect(transport.requests.single.path, '/rewards/me/monthly');
    },
  );

  test(
    'canonical SDK rejects forbidden monthly replies without retry',
    () async {
      final transport = SyntheticTransport(
        (_) => jsonResponse({'error': 'synthetic_forbidden'}, status: 403),
      );
      final client = syntheticClient(transport);
      await expectLater(
        client.getRewardsApi().getMyMonthlyRewards(),
        throwsA(
          isA<DioException>().having(
            (error) => error.response?.statusCode,
            'synthetic HTTP status',
            403,
          ),
        ),
      );
      expect(transport.requests, hasLength(1));
      expect(transport.requests.single.queryParameters, isEmpty);
      expect(transport.requests.single.data, isNull);
    },
  );

  test('canonical SDK refuses malformed monthly authority', () async {
    final transport = SyntheticTransport(
      (_) => jsonResponse(legacyMonthly()..remove('state')),
    );
    final client = syntheticClient(transport);
    await expectLater(
      client.getRewardsApi().getMyMonthlyRewards(),
      throwsA(
        isA<DioException>().having(
          (error) => error.type,
          'serialization failure',
          DioExceptionType.unknown,
        ),
      ),
    );
    expect(transport.requests, hasLength(1));
  });

  test('canonical SDK cancels a request before transport', () async {
    final transport = SyntheticTransport((_) => jsonResponse(legacyMonthly()));
    final client = syntheticClient(transport);
    final token = CancelToken()..cancel('synthetic cancellation');
    await expectLater(
      client.getRewardsApi().getMyMonthlyRewards(cancelToken: token),
      throwsA(
        isA<DioException>().having(
          (error) => error.type,
          'cancellation',
          DioExceptionType.cancel,
        ),
      ),
    );
    expect(transport.requests, isEmpty);
  });

  test(
    'canonical SDK preserves CSV bytes and private response headers',
    () async {
      const csv = 'source_month,source_score\r\n2026-12,13500\r\n';
      final transport = SyntheticTransport(
        (_) => ResponseBody.fromString(
          csv,
          200,
          headers: {
            Headers.contentTypeHeader: ['text/csv; charset=utf-8'],
            'cache-control': ['private, no-store'],
          },
        ),
      );
      final client = syntheticClient(transport);
      final response = await client
          .getReputationApi()
          .downloadMyMonthlyReputationReportCsv(sourceMonth: '2026-12');
      expect(response.data, csv);
      expect(response.headers.value('cache-control'), 'private, no-store');
      expect(
        transport.requests.single.path,
        '/reputation/me/reports/monthly/2026-12/export.csv',
      );
      expect(
        transport.requests.single.headers['Authorization'],
        'Bearer synthetic-sdk-owner',
      );
      expect(transport.requests.single.method, 'GET');
      expect(transport.requests.single.data, isNull);
    },
  );
}

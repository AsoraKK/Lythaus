import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/support/application/support_feedback_api.dart';

class _CountingAdapter implements HttpClientAdapter {
  _CountingAdapter({this.statusCode = 200});

  final int statusCode;
  int requests = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests += 1;
    return ResponseBody.fromString('{}', statusCode);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test(
    'non-contract mutation statuses cannot be reported as success',
    () async {
      final adapter = _CountingAdapter(statusCode: 202);
      final dio = Dio()..httpClientAdapter = adapter;
      addTearDown(dio.close);
      final client = DioSupportFeedbackClient(
        dio: dio,
        accessToken: () async => 'synthetic-token',
        isCurrentSession: () => true,
      );

      await expectLater(
        client.submit(
          kind: 'problem',
          body: const <String, dynamic>{'title': 'Synthetic report'},
          idempotencyKey: 'synthetic-idempotency-key',
        ),
        throwsA(
          isA<SupportFeedbackApiException>().having(
            (error) => error.statusCode,
            'statusCode',
            503,
          ),
        ),
      );
      expect(adapter.requests, 1);
    },
  );

  test('mutation validation rejects identifiers outside the API contract', () {
    final malformed = <String, dynamic>{
      'request': <String, dynamic>{
        'id': 'not-a-uuid',
        'kind': 'problem',
        'category': 'display',
        'title': 'Synthetic report',
        'revision': 1,
        'state': 'submitted',
      },
      'recordId': 'also-not-a-uuid',
      'replayed': false,
    };

    expect(
      () => validateSupportFeedbackMutationResult(malformed, kind: 'problem'),
      throwsA(isA<SupportFeedbackApiException>()),
    );
  });

  test(
    'cancel while resolving the session token prevents the HTTP request',
    () async {
      final token = Completer<String?>();
      final adapter = _CountingAdapter();
      final dio = Dio()..httpClientAdapter = adapter;
      addTearDown(dio.close);
      final client = DioSupportFeedbackClient(
        dio: dio,
        accessToken: () => token.future,
        isCurrentSession: () => true,
      );

      final pending = client.list(kind: 'problem', limit: 20);
      await Future<void>.delayed(Duration.zero);
      client.cancelPending();
      await expectLater(
        pending.timeout(const Duration(seconds: 1)),
        throwsA(isA<SupportFeedbackCancelled>()),
      );
      token.complete('synthetic-token');
      expect(adapter.requests, 0);
    },
  );
}

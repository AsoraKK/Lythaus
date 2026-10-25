import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';

class _InterruptedTransport implements HttpClientAdapter {
  _InterruptedTransport(this.failure, {this.failRetry = false});

  final DioExceptionType failure;
  final bool failRetry;
  final requests = <({String? key, Object? body, Object? authorization})>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add((
      key: options.headers['Idempotency-Key'] as String?,
      body: options.data,
      authorization: options.headers['Authorization'],
    ));
    if (requests.length == 1 || failRetry) {
      throw DioException(requestOptions: options, type: failure);
    }
    return ResponseBody.fromString(
      '{"accepted":true}',
      202,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  for (final failure in [
    DioExceptionType.connectionTimeout,
    DioExceptionType.sendTimeout,
    DioExceptionType.receiveTimeout,
    DioExceptionType.connectionError,
  ]) {
    for (final failRetry in [false, true]) {
      test(
        'interrupted $failure retries once, retry fails=$failRetry',
        () async {
          final transport = _InterruptedTransport(
            failure,
            failRetry: failRetry,
          );
          final dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid'));
          addTearDown(dio.close);
          dio.httpClientAdapter = transport;
          dio.interceptors.add(IdempotencyRetryInterceptor(dio));
          final operation = dio.post<Map<String, dynamic>>(
            '/synthetic-write',
            data: {'intent': 'synthetic'},
            options: Options(
              headers: {
                'Idempotency-Key': 'synthetic-intent-1234',
                'Authorization': 'Bearer synthetic-session',
              },
            ),
          );
          if (failRetry) {
            await expectLater(
              operation,
              throwsA(
                isA<DioException>().having((e) => e.type, 'type', failure),
              ),
            );
          } else {
            expect((await operation).data, {'accepted': true});
          }
          expect(transport.requests, hasLength(2));
          expect(transport.requests.first, transport.requests.last);
          expect(transport.requests.first.key, 'synthetic-intent-1234');
          expect(transport.requests.first.body, {'intent': 'synthetic'});
          expect(
            transport.requests.first.authorization,
            'Bearer synthetic-session',
          );
        },
      );
    }
  }

  for (final key in <String?>[null, 'short', 'invalid key with spaces']) {
    test('interrupted request with unsafe key $key is not retried', () async {
      final transport = _InterruptedTransport(DioExceptionType.connectionError);
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid'));
      addTearDown(dio.close);
      dio.httpClientAdapter = transport;
      dio.interceptors.add(IdempotencyRetryInterceptor(dio));
      await expectLater(
        dio.post<void>(
          '/synthetic-write',
          options: Options(headers: {if (key != null) 'Idempotency-Key': key}),
        ),
        throwsA(isA<DioException>()),
      );
      expect(transport.requests, hasLength(1));
    });
  }

  for (final failure in [
    DioExceptionType.badResponse,
    DioExceptionType.badCertificate,
    DioExceptionType.cancel,
    DioExceptionType.unknown,
  ]) {
    test('$failure is not a retryable interruption', () async {
      final transport = _InterruptedTransport(failure);
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid'));
      addTearDown(dio.close);
      dio.httpClientAdapter = transport;
      dio.interceptors.add(IdempotencyRetryInterceptor(dio));
      await expectLater(
        dio.post<void>(
          '/synthetic-write',
          options: Options(
            headers: {'Idempotency-Key': 'synthetic-intent-1234'},
          ),
        ),
        throwsA(isA<DioException>()),
      );
      expect(transport.requests, hasLength(1));
    });
  }

  test('explicit retry opt-out preserves one request', () async {
    final transport = _InterruptedTransport(DioExceptionType.connectionError);
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid'));
    addTearDown(dio.close);
    dio.httpClientAdapter = transport;
    dio.interceptors.add(IdempotencyRetryInterceptor(dio));
    await expectLater(
      dio.post<void>(
        '/synthetic-write',
        options: Options(
          headers: {'Idempotency-Key': 'synthetic-intent-1234'},
          extra: {
            IdempotencyRetryInterceptor.disableAutomaticRetryExtraKey: true,
          },
        ),
      ),
      throwsA(isA<DioException>()),
    );
    expect(transport.requests, hasLength(1));
  });
}

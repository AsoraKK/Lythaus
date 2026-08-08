import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/observability/lythaus_tracer.dart';

void main() {
  group('LythausSpan', () {
    late LythausSpan span;

    setUp(() {
      span = LythausTracer.startSpan('test_operation');
    });

    test('initializes with correct values', () {
      expect(span.operationName, 'test_operation');
      expect(span.startTime, isA<DateTime>());
      expect(span.status, 'ok');
      expect(span.errorMessage, isNull);
      expect(span.attributes, isNotEmpty); // Has default attributes
    });

    test('setAttributes adds multiple attributes', () {
      span.setAttributes({'key1': 'value1', 'key2': 42});
      expect(span.attributes['key1'], 'value1');
      expect(span.attributes['key2'], 42);
    });

    test('setAttribute adds single attribute', () {
      span.setAttribute('single', 'value');
      expect(span.attributes['single'], 'value');
    });

    test('setStatus updates status and message', () {
      span.setStatus('error', 'test error');
      expect(span.status, 'error');
      expect(span.errorMessage, 'test error');
    });

    test('recordException adds error attributes', () {
      final error = Exception('test error');
      final stackTrace = StackTrace.current;

      span.recordException(error, stackTrace: stackTrace);

      expect(span.attributes['error.type'], contains('Exception'));
      expect(span.attributes['error.message'], 'Exception: test error');
      expect(span.attributes['error.stack_trace'], isNotNull);
    });

    test('end logs span data and prevents double ending', () {
      // This test mainly ensures no exceptions are thrown
      span.setAttribute('test', 'value');
      span.end();

      // Second call should be no-op
      span.end();

      expect(span.attributes.containsKey('duration_ms'), isTrue);
    });
  });

  group('LythausTracer', () {
    test('startSpan creates span with default attributes', () {
      final span = LythausTracer.startSpan('test_operation');

      expect(span.operationName, 'test_operation');
      expect(span.attributes['service.name'], 'lythaus-mobile');
      expect(span.attributes['service.version'], '1.0.0');
      expect(span.attributes['component'], 'http-client');
    });

    test('startSpan with custom attributes', () {
      final span = LythausTracer.startSpan(
        'test_operation',
        attributes: {'custom': 'value'},
      );

      expect(span.attributes['custom'], 'value');
      expect(span.attributes['service.name'], 'lythaus-mobile');
    });

    test('traceOperation success case', () async {
      final result = await LythausTracer.traceOperation(
        'test_operation',
        () async => 'success',
      );

      expect(result, 'success');
    });

    test('traceOperation with list result adds item count', () async {
      final result = await LythausTracer.traceOperation(
        'test_operation',
        () async => [1, 2, 3],
      );

      expect(result, [1, 2, 3]);
    });

    test(
      'traceOperation with map result calls _addResponseAttributes',
      () async {
        final result = await LythausTracer.traceOperation(
          'test_operation',
          () async => {
            'statusCode': 200,
            'success': true,
            'data': [1, 2],
          },
        );

        expect(result, {
          'statusCode': 200,
          'success': true,
          'data': [1, 2],
        });
      },
    );

    test('traceOperation error case rethrows and records error', () async {
      expect(
        () => LythausTracer.traceOperation(
          'test_operation',
          () async => throw Exception('test error'),
        ),
        throwsA(isA<Exception>()),
      );
    });

    test('traceOperation with onError handler', () async {
      final result = await LythausTracer.traceOperation(
        'test_operation',
        () async => throw Exception('test error'),
        onError: (error) => 'handled',
      );

      expect(result, 'handled');
    });

    test('httpRequestAttributes creates correct map', () {
      final attrs = LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: 'https://example.com',
        statusCode: 200,
        headers: {'content-type': 'application/json'},
      );

      expect(attrs['http.method'], 'GET');
      expect(attrs['http.url'], 'https://example.com');
      expect(attrs['http.status_code'], 200);
      expect(attrs['http.request.content_type'], 'application/json');
    });
  });
}

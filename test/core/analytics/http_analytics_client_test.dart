import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'package:lythaus/core/analytics/http_analytics_client.dart';

import 'http_analytics_client_test.mocks.dart';

@GenerateMocks([Dio])
void main() {
  group('HttpAnalyticsClient', () {
    group('Event queuing', () {
      test('logEvent adds event to queue', () async {
        final mockDio = MockDio();
        final client = HttpAnalyticsClient(dio: mockDio);

        await client.logEvent('test_event', properties: {'key': 'value'});

        // No immediate network call
        verifyNever(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        );
      });

      test('flush sends events to backend', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        await client.logEvent('event1');
        await client.logEvent('event2');
        await client.flush();

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: argThat(
              isA<Map<String, dynamic>>().having(
                (m) => (m['events'] as List).length,
                'events count',
                2,
              ),
              named: 'data',
            ),
            options: anyNamed('options'),
          ),
        ).called(1);
      });

      test('flush threshold triggers automatic flush', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio, flushThreshold: 3);

        await client.logEvent('event1');
        await client.logEvent('event2');
        verifyNever(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        );

        await client.logEvent('event3'); // Should trigger flush

        await Future<void>.delayed(const Duration(milliseconds: 100));

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).called(1);
      });
    });

    group('Session and metadata', () {
      test('flush includes session ID and metadata', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(
          dio: mockDio,
          appVersion: '2.0.0',
          platform: 'ios',
        );

        await client.logEvent('test');
        await client.flush();

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: argThat(
              isA<Map<String, dynamic>>()
                  .having((m) => m['sessionId'], 'sessionId', isNotNull)
                  .having((m) => m['app'], 'app', {
                    'version': '2.0.0',
                    'platform': 'ios',
                  }),
              named: 'data',
            ),
            options: anyNamed('options'),
          ),
        ).called(1);
      });
    });

    group('User identification', () {
      test('setUserId includes userId in flush payload', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        await client.setUserId('user123');
        await client.logEvent('test');
        await client.flush();

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: argThat(
              isA<Map<String, dynamic>>().having(
                (m) => m['userId'],
                'userId',
                'user123',
              ),
              named: 'data',
            ),
            options: anyNamed('options'),
          ),
        ).called(1);
      });

      test('reset generates new session ID', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        await client.logEvent('before_reset');
        await client.flush();

        final firstCall = verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: captureAnyNamed('data'),
            options: anyNamed('options'),
          ),
        );
        firstCall.called(1);
        final firstSessionId = (firstCall.captured.first as Map)['sessionId'];

        await client.reset();
        await client.logEvent('after_reset');
        await client.flush();

        final secondCall = verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: captureAnyNamed('data'),
            options: anyNamed('options'),
          ),
        );
        secondCall.called(1);
        final secondSessionId = (secondCall.captured.first as Map)['sessionId'];

        expect(secondSessionId, isNot(firstSessionId));
      });
    });

    group('Error resilience', () {
      test('flush handles network errors gracefully', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenThrow(
          DioException(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            message: 'Network error',
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        await client.logEvent('event1');

        // Should not throw
        await expectLater(client.flush(), completes);
      });

      test('dispose flushes pending events', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        await client.logEvent('event1');
        await client.dispose();

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).called(1);
      });
    });

    group('Validation', () {
      test('validates event name format', () async {
        final mockDio = MockDio();
        final client = HttpAnalyticsClient(dio: mockDio);

        // Invalid event names should be rejected
        await client.logEvent('Invalid-Name'); // Hyphens not allowed
        await client.logEvent('UPPERCASE'); // Uppercase not allowed
        await client.logEvent('has spaces'); // Spaces not allowed

        await client.flush();

        // No events should be sent
        verifyNever(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        );
      });

      test('validates property count limit', () async {
        final mockDio = MockDio();
        final client = HttpAnalyticsClient(dio: mockDio);

        // More than 20 properties
        final tooManyProps = Map.fromEntries(
          List.generate(21, (i) => MapEntry('key$i', 'value$i')),
        );

        await client.logEvent('test', properties: tooManyProps);
        await client.flush();

        // Event should be rejected
        verifyNever(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        );
      });

      test('validates property types', () async {
        final mockDio = MockDio();
        when(
          mockDio.post<Map<String, dynamic>>(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/api/analytics/events'),
            statusCode: 200,
          ),
        );

        final client = HttpAnalyticsClient(dio: mockDio);

        // Valid types
        await client.logEvent(
          'test',
          properties: {
            'string_val': 'hello',
            'int_val': 42,
            'double_val': 3.14,
            'bool_val': true,
            'list_val': [1, 2, 3],
          },
        );
        await client.flush();

        verify(
          mockDio.post<Map<String, dynamic>>(
            '/api/analytics/events',
            data: anyNamed('data'),
            options: anyNamed('options'),
          ),
        ).called(1);
      });

      test(
        'strips trust-sensitive telemetry keys from event payload',
        () async {
          final mockDio = MockDio();
          when(
            mockDio.post<Map<String, dynamic>>(
              any,
              data: anyNamed('data'),
              options: anyNamed('options'),
            ),
          ).thenAnswer(
            (_) async => Response(
              requestOptions: RequestOptions(path: '/api/analytics/events'),
              statusCode: 200,
            ),
          );

          final client = HttpAnalyticsClient(dio: mockDio);

          await client.logEvent(
            'receipt_loaded',
            properties: {
              'event_id': 'evt-1',
              'capture_metadata_hash': 'abc123',
              'source_attestation_url': 'https://example.com/attestation',
              'status': 'ok',
            },
          );
          await client.flush();

          final verification = verify(
            mockDio.post<Map<String, dynamic>>(
              '/api/analytics/events',
              data: captureAnyNamed('data'),
              options: anyNamed('options'),
            ),
          );
          verification.called(1);

          final data = verification.captured.first as Map<String, dynamic>;
          final events = (data['events'] as List).cast<Map<String, dynamic>>();
          final props = events.first['props'] as Map<String, dynamic>;

          expect(props.containsKey('event_id'), isFalse);
          expect(props.containsKey('capture_metadata_hash'), isFalse);
          expect(props.containsKey('source_attestation_url'), isFalse);
          expect(props['status'], 'ok');
        },
      );
    });
  });
}

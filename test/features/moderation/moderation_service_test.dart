import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lythaus/features/moderation/moderation_service.dart';
import 'dart:convert';

// Mock HTTP client that captures requests
class MockHttpClient extends http.BaseClient {
  final List<http.Request> capturedRequests = [];
  final Map<String, http.Response> responses = {};

  void addResponse(String url, http.Response response) {
    responses[url] = response;
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    capturedRequests.add(request as http.Request);
    final response = responses[request.url.toString()];
    if (response != null) {
      return http.StreamedResponse(
        Stream.value(response.bodyBytes),
        response.statusCode,
        headers: response.headers,
      );
    }
    // Default success response
    return http.StreamedResponse(
      Stream.value(utf8.encode('{"success": true}')),
      200,
    );
  }
}

void main() {
  group('ModerationService', () {
    late ModerationService service;
    late MockHttpClient mockClient;
    const baseUrl = 'https://api.example.com';
    const accessToken = 'test_token';

    setUp(() {
      mockClient = MockHttpClient();
      service = ModerationService(baseUrl, httpClient: mockClient);
    });

    group('Constructor Tests', () {
      test('should initialize with baseUrl', () {
        expect(service.baseUrl, equals(baseUrl));
      });

      test('should initialize with custom http client', () {
        final customClient = http.Client();
        final customService = ModerationService(
          baseUrl,
          httpClient: customClient,
        );
        expect(customService.baseUrl, equals(baseUrl));
      });

      test('should initialize with default http client when none provided', () {
        final defaultService = ModerationService(baseUrl);
        expect(defaultService.baseUrl, equals(baseUrl));
      });
    });

    group('fetchReviewQueue Tests', () {
      test('should construct correct URL with default parameters', () async {
        mockClient.addResponse(
          '$baseUrl/api/moderation/review-queue?page=1&pageSize=20&status=pending',
          http.Response('{"items": [], "total": 0}', 200),
        );

        await service.fetchReviewQueue(accessToken: accessToken);

        expect(mockClient.capturedRequests.length, equals(1));
        final request = mockClient.capturedRequests.first;
        expect(
          request.url.toString(),
          equals(
            '$baseUrl/api/moderation/review-queue?page=1&pageSize=20&status=pending',
          ),
        );
        expect(request.headers['Authorization'], equals('Bearer $accessToken'));
      });

      test('should construct URL with custom parameters', () async {
        const page = 2;
        const pageSize = 50;
        const status = 'approved';

        mockClient.addResponse(
          '$baseUrl/api/moderation/review-queue?page=$page&pageSize=$pageSize&status=$status',
          http.Response('{"items": [], "total": 0}', 200),
        );

        await service.fetchReviewQueue(
          accessToken: accessToken,
          page: page,
          pageSize: pageSize,
          status: status,
        );

        final request = mockClient.capturedRequests.first;
        expect(
          request.url.query,
          equals('page=$page&pageSize=$pageSize&status=$status'),
        );
      });

      test('should throw exception on failure response', () async {
        mockClient.addResponse(
          '$baseUrl/api/moderation/review-queue?page=1&pageSize=20&status=pending',
          http.Response('Error', 400),
        );

        expect(
          () => service.fetchReviewQueue(accessToken: accessToken),
          throwsA(isA<Exception>()),
        );
      });

      test('should return parsed JSON response on success', () async {
        final responseData = {
          'items': [
            {'id': '1'},
          ],
          'total': 1,
        };
        mockClient.addResponse(
          '$baseUrl/api/moderation/review-queue?page=1&pageSize=20&status=pending',
          http.Response(jsonEncode(responseData), 200),
        );

        final result = await service.fetchReviewQueue(accessToken: accessToken);

        expect(result, equals(responseData));
      });
    });

    group('approve Tests', () {
      test('should construct correct URL and make POST request', () async {
        const appealId = 'test_appeal_123';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/approve',
          http.Response('', 200),
        );

        await service.approve(accessToken, appealId);

        expect(mockClient.capturedRequests.length, equals(1));
        final request = mockClient.capturedRequests.first;
        expect(request.method, equals('POST'));
        expect(
          request.url.toString(),
          equals('$baseUrl/api/moderation/appeals/$appealId/approve'),
        );
        expect(request.headers['Authorization'], equals('Bearer $accessToken'));
      });

      test('should throw exception on failure response', () async {
        const appealId = 'test_appeal_123';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/approve',
          http.Response('Error', 400),
        );

        expect(
          () => service.approve(accessToken, appealId),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('reject Tests', () {
      test('should construct correct URL and make POST request', () async {
        const appealId = 'test_appeal_456';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/reject',
          http.Response('', 200),
        );

        await service.reject(accessToken, appealId);

        expect(mockClient.capturedRequests.length, equals(1));
        final request = mockClient.capturedRequests.first;
        expect(request.method, equals('POST'));
        expect(
          request.url.toString(),
          equals('$baseUrl/api/moderation/appeals/$appealId/reject'),
        );
        expect(request.headers['Authorization'], equals('Bearer $accessToken'));
      });

      test('should throw exception on failure response', () async {
        const appealId = 'test_appeal_456';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/reject',
          http.Response('Error', 500),
        );

        expect(
          () => service.reject(accessToken, appealId),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('escalate Tests', () {
      test('should construct correct URL and make POST request', () async {
        const appealId = 'test_appeal_789';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/escalate',
          http.Response('', 200),
        );

        await service.escalate(accessToken, appealId);

        expect(mockClient.capturedRequests.length, equals(1));
        final request = mockClient.capturedRequests.first;
        expect(request.method, equals('POST'));
        expect(
          request.url.toString(),
          equals('$baseUrl/api/moderation/appeals/$appealId/escalate'),
        );
        expect(request.headers['Authorization'], equals('Bearer $accessToken'));
      });

      test('should throw exception on failure response', () async {
        const appealId = 'test_appeal_789';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/escalate',
          http.Response('Error', 403),
        );

        expect(
          () => service.escalate(accessToken, appealId),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('vote Tests', () {
      test(
        'should construct correct URL and make POST request with JSON body',
        () async {
          const appealId = 'test_appeal_vote';
          const vote = 'approve';
          mockClient.addResponse(
            '$baseUrl/api/moderation/appeals/$appealId/vote',
            http.Response('', 200),
          );

          await service.vote(accessToken, appealId, vote);

          expect(mockClient.capturedRequests.length, equals(1));
          final request = mockClient.capturedRequests.first;
          expect(request.method, equals('POST'));
          expect(
            request.url.toString(),
            equals('$baseUrl/api/moderation/appeals/$appealId/vote'),
          );
          expect(
            request.headers['Authorization'],
            equals('Bearer $accessToken'),
          );
          expect(
            request.headers['Content-Type'],
            startsWith('application/json'),
          );
          expect(request.body, equals(jsonEncode({'vote': vote})));
        },
      );

      test('should handle different vote values', () async {
        const appealId = 'test_appeal_vote2';
        const vote = 'reject';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/vote',
          http.Response('', 200),
        );

        await service.vote(accessToken, appealId, vote);

        final request = mockClient.capturedRequests.first;
        expect(request.body, equals(jsonEncode({'vote': vote})));
      });

      test('should throw exception on failure response', () async {
        const appealId = 'test_appeal_vote3';
        const vote = 'invalid';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/vote',
          http.Response('Error', 400),
        );

        expect(
          () => service.vote(accessToken, appealId, vote),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('Appeal ID Validation Tests', () {
      test('should handle special characters in appeal ID', () async {
        const appealId = 'appeal-with-special_chars.123';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/$appealId/approve',
          http.Response('', 200),
        );

        await service.approve(accessToken, appealId);

        final request = mockClient.capturedRequests.first;
        expect(request.url.path, contains(appealId));
      });

      test('should handle URL encoding in appeal ID', () async {
        const appealId = 'appeal with spaces';
        mockClient.addResponse(
          '$baseUrl/api/moderation/appeals/${Uri.encodeComponent(appealId)}/reject',
          http.Response('', 200),
        );

        await service.reject(accessToken, appealId);

        final request = mockClient.capturedRequests.first;
        expect(request.url.toString(), contains('appeal%20with%20spaces'));
      });
    });
  });
}

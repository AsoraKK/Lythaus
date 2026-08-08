/// Unit tests for ProfileService — simple HTTP service, easily tested
/// with a mock http.Client.
library;

import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lythaus/features/profile/application/profile_service.dart';

void main() {
  group('ProfileService.upsertProfile', () {
    test('succeeds on 200 response', () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/users/profile');
        expect(request.headers['Authorization'], 'Bearer token123');
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['displayName'], 'Alice');
        expect(body['bio'], 'Hello');
        return http.Response('{}', 200);
      });

      final service = ProfileService(
        'https://api.example.com',
        httpClient: client,
      );

      await expectLater(
        service.upsertProfile(
          accessToken: 'token123',
          displayName: 'Alice',
          bio: 'Hello',
        ),
        completes,
      );
    });

    test('throws on moderation_rejected (400)', () async {
      final client = MockClient((request) async {
        return http.Response(jsonEncode({'error': 'moderation_rejected'}), 400);
      });

      final service = ProfileService(
        'https://api.example.com',
        httpClient: client,
      );

      await expectLater(
        service.upsertProfile(accessToken: 'tok', displayName: 'Rude name'),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('profane or toxic'),
          ),
        ),
      );
    });

    test('throws generic error on non-200 non-moderation response', () async {
      final client = MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'Server error happened'}),
          500,
        );
      });

      final service = ProfileService(
        'https://api.example.com',
        httpClient: client,
      );

      await expectLater(
        service.upsertProfile(accessToken: 'tok', displayName: 'Normal'),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('Server error happened'),
          ),
        ),
      );
    });

    test('sends optional fields when provided', () async {
      final client = MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['location'], 'NYC');
        expect(body['website'], 'https://example.com');
        return http.Response('{}', 200);
      });

      final service = ProfileService(
        'https://api.example.com',
        httpClient: client,
      );

      await service.upsertProfile(
        accessToken: 'tok',
        displayName: 'Bob',
        bio: 'Bio',
        location: 'NYC',
        website: 'https://example.com',
      );
    });

    test('throws with fallback message when response has no message', () async {
      final client = MockClient((request) async {
        return http.Response(jsonEncode({}), 422);
      });

      final service = ProfileService(
        'https://api.example.com',
        httpClient: client,
      );

      await expectLater(
        service.upsertProfile(accessToken: 'tok', displayName: 'Test'),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('Profile update failed'),
          ),
        ),
      );
    });
  });
}

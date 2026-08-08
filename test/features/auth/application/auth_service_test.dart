import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('email login stores the session and loads the current user', () async {
    final client = MockClient((request) async {
      if (request.url.path == '/api/auth/email') {
        expect(jsonDecode(request.body), containsPair('mode', 'login'));
        return http.Response(
          jsonEncode({
            'data': {
              'accessToken': 'access-token',
              'refreshToken': 'refresh-token',
              'expiresIn': 900,
            },
          }),
          200,
        );
      }
      expect(request.url.path, '/api/auth/userinfo');
      expect(request.headers['Authorization'], 'Bearer access-token');
      return http.Response(
        jsonEncode({
          'data': {
            'id': '018f0000-0000-7000-8000-000000000001',
            'email': 'person@example.com',
            'role': 'user',
            'tier': 'bronze',
            'subscription_tier': 'free',
            'reputation_score': 0,
            'created_at': '2026-08-06T00:00:00.000Z',
            'last_login_at': '2026-08-06T00:00:00.000Z',
          },
        }),
        200,
      );
    });
    final service = AuthService(
      httpClient: client,
      authUrl: 'https://api.lythaus.co/api',
    );

    final user = await service.loginWithEmail(
      'person@example.com',
      'correct-horse-battery-staple',
    );

    expect(user.email, 'person@example.com');
    expect(await service.getJwtToken(), 'access-token');
  });

  test('email login rejects short passwords before network access', () async {
    final service = AuthService(
      httpClient: MockClient((_) async => throw StateError('not called')),
      authUrl: 'https://api.lythaus.co/api',
    );

    expect(
      () => service.loginWithEmail('person@example.com', 'short'),
      throwsA(isA<AuthFailure>()),
    );
  });
}

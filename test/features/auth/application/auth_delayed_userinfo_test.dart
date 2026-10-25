import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';

http.Response _userResponse(String account) => http.Response(
  jsonEncode({
    'id': account == 'a'
        ? '018f0000-0000-7000-8000-000000000001'
        : '018f0000-0000-7000-8000-000000000002',
    'email': 'account-$account@example.invalid',
    'role': 'user',
    'tier': 'bronze',
    'created_at': '2026-08-01T00:00:00Z',
    'last_login_at': '2026-08-01T00:00:00Z',
  }),
  200,
);

Future<Object?> _outcome(Future<Object?> operation) async {
  try {
    return await operation;
  } on Object catch (error) {
    return error;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final validateOnly in [false, true]) {
    for (final afterRefresh in validateOnly ? [false] : [false, true]) {
      for (final result in [
        'success',
        'unauthorized',
        'unavailable',
        'transport',
      ]) {
        test(
          'delayed userinfo $result after account switch '
          '(validateOnly=$validateOnly, afterRefresh=$afterRefresh)',
          () async {
            FlutterSecureStorage.setMockInitialValues({
              'jwt': 'account-a-access',
              'refreshToken': 'account-a-refresh',
            });
            final userinfoStarted = Completer<void>();
            final userinfoResponse = Completer<http.Response>();
            final refreshCredentials = <String>[];
            var logoutRequests = 0;
            final service = AuthService(
              authUrl: 'https://api.lythaus.test/api',
              httpClient: MockClient((request) async {
                if (request.url.path == '/api/auth/userinfo') {
                  final authorization = request.headers['Authorization'];
                  if (authorization == 'Bearer account-b-access') {
                    return _userResponse('b');
                  }
                  if (afterRefresh &&
                      authorization == 'Bearer account-a-access') {
                    return http.Response('{}', 401);
                  }
                  expect(
                    authorization,
                    'Bearer account-a-${afterRefresh ? 'renewed' : 'access'}',
                  );
                  userinfoStarted.complete();
                  return userinfoResponse.future;
                }
                if (request.url.path == '/api/auth/refresh') {
                  final body = jsonDecode(request.body) as Map<String, dynamic>;
                  refreshCredentials.add(body['refreshToken'] as String);
                  return http.Response(
                    '{"accessToken":"account-a-renewed",'
                    '"refreshToken":"account-a-rotated"}',
                    200,
                  );
                }
                if (request.url.path == '/api/auth/email') {
                  return http.Response(
                    '{"accessToken":"account-b-access",'
                    '"refreshToken":"account-b-refresh"}',
                    200,
                  );
                }
                if (request.url.path == '/api/auth/logout') {
                  logoutRequests++;
                  return http.Response('{"loggedOut":true}', 200);
                }
                throw StateError('Unexpected local request');
              }),
            );

            final oldOperation = _outcome(
              validateOnly
                  ? service.validateAndRefreshToken()
                  : service.getCurrentUser(),
            );
            await userinfoStarted.future;
            final replacement = await service.loginWithEmail(
              'account-b@example.invalid',
              'synthetic account b passphrase',
            );
            expect(replacement.id, '018f0000-0000-7000-8000-000000000002');
            switch (result) {
              case 'success':
                userinfoResponse.complete(_userResponse('a'));
              case 'unauthorized':
                userinfoResponse.complete(http.Response('{}', 401));
              case 'unavailable':
                userinfoResponse.complete(http.Response('{}', 503));
              case 'transport':
                userinfoResponse.completeError(http.ClientException('offline'));
            }

            final outcome = await oldOperation;
            expect(
              refreshCredentials,
              afterRefresh ? ['account-a-refresh'] : <String>[],
            );
            expect(logoutRequests, 0);
            expect(await service.getJwtToken(), 'account-b-access');
            expect(
              await const FlutterSecureStorage().read(key: 'refreshToken'),
              'account-b-refresh',
            );
            expect(outcome, validateOnly ? isFalse : isNull);
          },
        );
      }
    }
  }
}

import 'dart:convert';
import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

class _AuthTestSecureStorage extends FlutterSecureStorage {
  _AuthTestSecureStorage(
    Map<String, String> initialValues, {
    this.jwtRead,
    this.jwtReadStarted,
    this.refreshTokenWriteStarted,
    this.releaseRefreshTokenWrite,
  }) : values = {...initialValues};

  final Map<String, String> values;
  final Completer<String?>? jwtRead;
  final Completer<void>? jwtReadStarted;
  final Completer<void>? refreshTokenWriteStarted;
  final Completer<void>? releaseRefreshTokenWrite;

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (key == 'jwt' && jwtRead != null && !jwtRead!.isCompleted) {
      if (jwtReadStarted != null && !jwtReadStarted!.isCompleted) {
        jwtReadStarted!.complete();
      }
      return jwtRead!.future;
    }
    return values[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (key == 'refreshToken' && value == 'account-b-refresh') {
      if (refreshTokenWriteStarted != null &&
          !refreshTokenWriteStarted!.isCompleted) {
        refreshTokenWriteStarted!.complete();
      }
      if (releaseRefreshTokenWrite != null) {
        await releaseRefreshTokenWrite!.future;
      }
    }
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    values.remove(key);
  }
}

Future<Object?> _resultOrError<T>(Future<T> future) async {
  try {
    return await future;
  } on Object catch (error) {
    return error;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  for (final initialUnauthorized in [false, true]) {
    test(
      'native restoration validates userinfo and rotates only when needed: $initialUnauthorized',
      () async {
        FlutterSecureStorage.setMockInitialValues({
          'jwt': 'old-access',
          'refreshToken': 'original-refresh',
        });
        var userinfoCalls = 0;
        final service = AuthService(
          authUrl: 'https://api.lythaus.co/api',
          httpClient: MockClient((request) async {
            if (request.url.path.endsWith('/refresh')) {
              return http.Response(
                '{"access_token":"new-access","refresh_token":"rotated-refresh"}',
                200,
              );
            }
            userinfoCalls++;
            if (initialUnauthorized && userinfoCalls == 1) {
              return http.Response('{}', 401);
            }
            return http.Response(
              jsonEncode({
                'id': '018f0000-0000-7000-8000-000000000001',
                'email': 'synthetic@example.invalid',
                'role': 'user',
                'tier': 'bronze',
                'created_at': '2026-08-01T00:00:00Z',
                'last_login_at': '2026-08-01T00:00:00Z',
              }),
              200,
            );
          }),
        );
        expect(
          (await service.getCurrentUser())?.id,
          '018f0000-0000-7000-8000-000000000001',
        );
        expect(userinfoCalls, initialUnauthorized ? 2 : 1);
        expect(await service.isAuthenticated(), isTrue);
        expect(await service.validateAndRefreshToken(), isTrue);
        await service.clearAfterOtherTabSignOut();
        expect(await service.isAuthenticated(), isFalse);
        expect(await service.refreshSession(), isFalse);
      },
    );
  }

  for (final status in [401, 503]) {
    test('userinfo and refresh rejection stay fail-closed: $status', () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'old-access',
        'refreshToken': 'old-refresh',
      });
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((_) async => http.Response('{}', status)),
      );
      if (status == 401) {
        expect(await service.getCurrentUser(), isNull);
        expect(await service.validateAndRefreshToken(), isFalse);
      } else {
        await expectLater(
          service.getCurrentUser(),
          throwsA(isA<AuthFailure>()),
        );
        await expectLater(
          service.validateAndRefreshToken(),
          throwsA(isA<AuthFailure>()),
        );
        await expectLater(
          service.refreshSession(),
          throwsA(isA<AuthFailure>()),
        );
      }
    });
  }

  for (final failure in [
    'missing_challenge',
    'rejected',
    'offline',
    'timeout',
  ]) {
    test('resend recovers from $failure without claiming delivery', () async {
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        requestTimeout: const Duration(milliseconds: 10),
        httpClient: MockClient((_) async {
          if (failure == 'offline') {
            throw StateError('private transport details');
          }
          if (failure == 'timeout') {
            await Future<void>.delayed(const Duration(milliseconds: 25));
          }
          return http.Response('{"error":"turnstile_failed"}', 400);
        }),
      );
      await expectLater(
        service.resendVerificationEmail(
          'synthetic@example.invalid',
          turnstileToken: failure == 'missing_challenge'
              ? ''
              : 'synthetic-challenge',
        ),
        throwsA(isA<AuthFailure>()),
      );
      expect(await service.getJwtToken(), isNull);
    });
  }

  test(
    'malformed login response and network failure never persist a partial session',
    () async {
      for (final body in ['{}', '[]']) {
        final service = AuthService(
          authUrl: 'https://api.lythaus.co/api',
          httpClient: MockClient((_) async => http.Response(body, 200)),
        );
        await expectLater(
          service.loginWithEmail('synthetic@example.invalid', 'historical12'),
          throwsA(isA<AuthFailure>()),
        );
        expect(await service.getJwtToken(), isNull);
        await expectLater(
          service.loginWithEmail('', 'historical12'),
          throwsA(isA<AuthFailure>()),
        );
      }
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((_) async => throw StateError('Offline')),
      );
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'old-access',
        'refreshToken': 'old-refresh',
      });
      await expectLater(service.getCurrentUser(), throwsA(isA<AuthFailure>()));
      await expectLater(service.refreshSession(), throwsA(isA<AuthFailure>()));
      expect(await service.validateAndRefreshToken(), isFalse);
    },
  );

  test(
    'native logout presents refresh proof when access has expired',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'expired-access',
        'refreshToken': 'synthetic-refresh',
      });
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((request) async {
          expect(request.url.path, '/api/auth/logout');
          expect(jsonDecode(request.body), {
            'refreshToken': 'synthetic-refresh',
          });
          return http.Response('{"loggedOut":true}', 200);
        }),
      );
      await service.logout();
      expect(service.remoteLogoutConfirmed, isTrue);
      expect(await service.getJwtToken(), isNull);
      expect(await service.refreshSession(), isFalse);
    },
  );

  test(
    '401 logout is not represented as successful server revocation',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'expired-access',
        'refreshToken': 'synthetic-refresh',
      });
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((_) async => http.Response('{}', 401)),
      );
      await service.logout();
      expect(service.remoteLogoutConfirmed, isFalse);
      expect(await service.getJwtToken(), isNull);
    },
  );

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

  test('email login rejects empty passwords before network access', () async {
    var calls = 0;
    final service = AuthService(
      httpClient: MockClient((_) async {
        calls++;
        throw StateError('not called');
      }),
      authUrl: 'https://api.lythaus.co/api',
    );

    await expectLater(
      service.loginWithEmail('person@example.com', ''),
      throwsA(isA<AuthFailure>()),
    );
    expect(calls, 0);
  });

  test(
    'web login keeps access in memory and refresh solely in the cookie contract',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'legacy-access',
        'refreshToken': 'legacy-refresh',
        'userData': 'legacy-user',
      });
      final service = AuthService(
        useWebSession: true,
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/email')) {
            expect(request.headers['X-Lythaus-Auth-Transport'], 'cookie-v1');
            return http.Response(
              '{"accessToken":"memory-access","sessionTransport":"cookie-v1","expiresIn":900}',
              200,
            );
          }
          return http.Response(
            '{"id":"018f0000-0000-7000-8000-000000000001","email":"synthetic@example.invalid","role":"user","created_at":"2026-08-06T00:00:00Z","last_login_at":"2026-08-06T00:00:00Z"}',
            200,
          );
        }),
      );
      await service.loginWithEmail(
        'synthetic@example.invalid',
        'legacy-password',
      );
      expect(await service.getJwtToken(), 'memory-access');
      expect(await const FlutterSecureStorage().readAll(), isEmpty);
    },
  );

  test(
    'web restore refreshes its cookie without reading or sending legacy browser tokens',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'legacy-access',
        'refreshToken': 'legacy-refresh',
      });
      var refreshes = 0;
      final service = AuthService(
        useWebSession: true,
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/refresh')) {
            refreshes++;
            expect(jsonDecode(request.body), isEmpty);
            expect(request.headers['X-Lythaus-Auth-Transport'], 'cookie-v1');
            return http.Response(
              '{"accessToken":"restored-access","sessionTransport":"cookie-v1"}',
              200,
            );
          }
          expect(request.headers['Authorization'], 'Bearer restored-access');
          return http.Response(
            '{"id":"018f0000-0000-7000-8000-000000000001","email":"synthetic@example.invalid","role":"user","created_at":"2026-08-06T00:00:00Z","last_login_at":"2026-08-06T00:00:00Z"}',
            200,
          );
        }),
      );
      expect(await service.getCurrentUser(), isNotNull);
      expect(refreshes, 1);
      expect(await const FlutterSecureStorage().readAll(), isEmpty);
    },
  );

  test(
    'userinfo dependency failure allows retry without refresh loops or destructive logout',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'access',
        'refreshToken': 'refresh',
      });
      final calls = <String>[];
      final service = AuthService(
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((request) async {
          calls.add(request.url.path);
          return http.Response('{"error":"userinfo_unavailable"}', 503);
        }),
      );
      await expectLater(service.getCurrentUser(), throwsA(isA<AuthFailure>()));
      expect(calls, ['/api/auth/userinfo']);
      expect(await service.getJwtToken(), 'access');
    },
  );

  test(
    'web sign out calls cookie logout even without an in-memory access token',
    () async {
      var requests = 0;
      final service = AuthService(
        useWebSession: true,
        authUrl: 'https://api.lythaus.co/api',
        httpClient: MockClient((request) async {
          requests++;
          expect(request.url.path, '/api/auth/logout');
          expect(request.headers['X-Lythaus-Auth-Transport'], 'cookie-v1');
          expect(request.headers.containsKey('Authorization'), false);
          return http.Response('{"loggedOut":true}', 200);
        }),
      );
      await service.logout();
      expect(requests, 1);
      expect(await service.getJwtToken(), isNull);
    },
  );

  test('legacy passwords reach the server unmodified', () async {
    final received = <String>[];
    final service = AuthService(
      httpClient: MockClient((request) async {
        received.add(
          (jsonDecode(request.body) as Map<String, dynamic>)['password']
              as String,
        );
        return http.Response('{"error":"invalid_credentials"}', 401);
      }),
      authUrl: 'https://api.lythaus.co/api',
    );
    for (final password in [
      'twelve-char!',
      'thirteen-char',
      'fourteen-char!',
      '  old pass  ',
    ]) {
      await expectLater(
        service.loginWithEmail('person@example.com', password),
        throwsA(isA<AuthFailure>()),
      );
      expect(received.last, password);
    }
    expect(received.length, 4);
  });

  test(
    'userinfo failure does not persist a half-authenticated session',
    () async {
      final service = AuthService(
        httpClient: MockClient(
          (request) async => request.url.path.endsWith('/email')
              ? http.Response(
                  '{"accessToken":"access","refreshToken":"refresh"}',
                  200,
                )
              : http.Response('<html>upstream unavailable</html>', 502),
        ),
        authUrl: 'https://api.lythaus.co/api',
      );
      await expectLater(
        service.loginWithEmail('person@example.test', 'legacy-word!'),
        throwsA(isA<AuthFailure>()),
      );
      expect(await service.getJwtToken(), isNull);
      expect(
        await const FlutterSecureStorage().read(key: 'refreshToken'),
        isNull,
      );
    },
  );

  test('stalled sign-in has a bounded recoverable timeout', () async {
    final service = AuthService(
      httpClient: MockClient((_) => Completer<http.Response>().future),
      requestTimeout: const Duration(milliseconds: 5),
      authUrl: 'https://api.lythaus.co/api',
    );
    await expectLater(
      service.loginWithEmail('person@example.test', 'legacy-word!'),
      throwsA(
        isA<AuthFailure>().having(
          (error) => error.message,
          'message',
          contains('timed out'),
        ),
      ),
    );
  });

  test('verification instruction is safe and actionable', () async {
    final service = AuthService(
      httpClient: MockClient(
        (_) async =>
            http.Response('{"error":"email_verification_required"}', 400),
      ),
      authUrl: 'https://api.lythaus.co/api',
    );
    await expectLater(
      service.loginWithEmail('person@example.test', 'legacy-word!'),
      throwsA(
        isA<AuthFailure>().having(
          (error) => error.message,
          'message',
          contains('Resend verification'),
        ),
      ),
    );
  });

  test('simultaneous refreshes share one request', () async {
    FlutterSecureStorage.setMockInitialValues({'refreshToken': 'original'});
    var calls = 0;
    final response = Completer<http.Response>();
    final service = AuthService(
      httpClient: MockClient((_) {
        calls++;
        return response.future;
      }),
      authUrl: 'https://api.lythaus.co/api',
    );
    final first = service.refreshSession();
    final second = service.refreshSession();
    response.complete(
      http.Response(
        '{"accessToken":"new-access","refreshToken":"new-refresh"}',
        200,
      ),
    );
    expect(await Future.wait([first, second]), [true, true]);
    expect(calls, 1);
  });

  test(
    'replacement account does not join a superseded refresh after logout',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'account-a-access',
        'refreshToken': 'account-a-refresh',
      });
      final accountARefreshStarted = Completer<void>();
      final accountARefreshResponse = Completer<http.Response>();
      final accountBRefreshStarted = Completer<void>();
      final accountBRefreshResponse = Completer<http.Response>();
      var refreshCalls = 0;
      final service = AuthService(
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/refresh') {
            refreshCalls++;
            if (refreshCalls == 1) {
              accountARefreshStarted.complete();
              return accountARefreshResponse.future;
            }
            accountBRefreshStarted.complete();
            return accountBRefreshResponse.future;
          }
          if (request.url.path == '/api/auth/logout') {
            return http.Response('{}', 200);
          }
          if (request.url.path == '/api/auth/email') {
            return http.Response(
              '{"accessToken":"account-b-access","refreshToken":"account-b-refresh"}',
              200,
            );
          }
          if (request.url.path == '/api/auth/userinfo') {
            return http.Response(
              jsonEncode({
                'id': '018f0000-0000-7000-8000-000000000002',
                'email': 'account-b@example.invalid',
                'role': 'user',
                'tier': 'bronze',
                'created_at': '2026-08-01T00:00:00Z',
                'last_login_at': '2026-08-01T00:00:00Z',
              }),
              200,
            );
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final accountARefresh = service.refreshSession();
      await accountARefreshStarted.future;
      await service.logout();
      expect(
        (await service.loginWithEmail(
          'account-b@example.invalid',
          'correct-horse-battery-staple',
        )).id,
        '018f0000-0000-7000-8000-000000000002',
      );

      final accountBRefresh = service.refreshSession();
      final secondRequestStarted = await accountBRefreshStarted.future
          .then((_) => true)
          .timeout(const Duration(seconds: 1), onTimeout: () => false);
      accountARefreshResponse.complete(
        http.Response(
          '{"accessToken":"late-account-a-access","refreshToken":"late-account-a-refresh"}',
          200,
        ),
      );
      expect(await accountARefresh, isFalse);

      final sharedAccountBRefresh = service.refreshSession();
      await Future<void>.delayed(Duration.zero);
      expect(refreshCalls, 2);
      accountBRefreshResponse.complete(
        http.Response(
          '{"accessToken":"account-b-renewed","refreshToken":"account-b-rotated"}',
          200,
        ),
      );
      expect(await Future.wait([accountBRefresh, sharedAccountBRefresh]), [
        true,
        true,
      ]);
      expect(secondRequestStarted, isTrue);
      expect(await service.getJwtToken(), 'account-b-renewed');
    },
  );

  test(
    'direct account replacement fences refreshes started while login is pending',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt': 'account-a-access',
        'refreshToken': 'account-a-refresh',
      });
      final accountARefresh0Started = Completer<void>();
      final accountARefresh0Response = Completer<http.Response>();
      final accountARefresh1Started = Completer<void>();
      final accountARefresh1Response = Completer<http.Response>();
      final accountBLoginStarted = Completer<void>();
      final accountBLoginResponse = Completer<http.Response>();
      var refreshCalls = 0;
      final service = AuthService(
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/refresh') {
            expect(
              (jsonDecode(request.body)
                  as Map<String, dynamic>)['refreshToken'],
              'account-a-refresh',
            );
            refreshCalls++;
            if (refreshCalls == 1) {
              accountARefresh0Started.complete();
              return accountARefresh0Response.future;
            }
            accountARefresh1Started.complete();
            return accountARefresh1Response.future;
          }
          if (request.url.path == '/api/auth/email') {
            accountBLoginStarted.complete();
            return accountBLoginResponse.future;
          }
          if (request.url.path == '/api/auth/userinfo') {
            expect(request.headers['Authorization'], 'Bearer account-b-access');
            return http.Response(
              jsonEncode({
                'id': '018f0000-0000-7000-8000-000000000003',
                'email': 'account-b@example.invalid',
                'role': 'user',
                'tier': 'bronze',
                'created_at': '2026-08-01T00:00:00Z',
                'last_login_at': '2026-08-01T00:00:00Z',
              }),
              200,
            );
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final accountARefresh0 = service.refreshSession();
      await accountARefresh0Started.future;
      final accountBLogin = service.loginWithEmail(
        'account-b@example.invalid',
        'correct-horse-battery-staple',
      );
      await accountBLoginStarted.future;
      final accountARefresh1 = service.refreshSession();
      await accountARefresh1Started.future;

      accountBLoginResponse.complete(
        http.Response(
          '{"accessToken":"account-b-access","refreshToken":"account-b-refresh"}',
          200,
        ),
      );
      expect((await accountBLogin).id, '018f0000-0000-7000-8000-000000000003');
      expect(await service.getJwtToken(), 'account-b-access');

      final accountARefresh1Outcome = _resultOrError(accountARefresh1);
      final accountARefresh0Outcome = _resultOrError(accountARefresh0);
      accountARefresh1Response.complete(
        http.Response(
          '{"accessToken":"late-account-a-access","refreshToken":"late-account-a-refresh"}',
          200,
        ),
      );
      accountARefresh0Response.complete(http.Response('{}', 503));
      expect(await accountARefresh1Outcome, isFalse);
      expect(await accountARefresh0Outcome, isFalse);
      expect(await service.getJwtToken(), 'account-b-access');
      expect(
        await const FlutterSecureStorage().read(key: 'refreshToken'),
        'account-b-refresh',
      );
      expect(refreshCalls, 2);
    },
  );

  test(
    'refresh during the serialized replacement write cannot overwrite the new account',
    () async {
      final releaseAccountBRefreshWrite = Completer<void>();
      final accountBRefreshWriteStarted = Completer<void>();
      final storage = _AuthTestSecureStorage(
        {'jwt': 'account-a-access', 'refreshToken': 'account-a-refresh'},
        refreshTokenWriteStarted: accountBRefreshWriteStarted,
        releaseRefreshTokenWrite: releaseAccountBRefreshWrite,
      );
      final accountARefresh0Started = Completer<void>();
      final accountARefresh0Response = Completer<http.Response>();
      final accountARefresh1Started = Completer<void>();
      final accountARefresh1Response = Completer<http.Response>();
      var refreshCalls = 0;
      final service = AuthService(
        secureStorage: storage,
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/refresh') {
            expect(
              (jsonDecode(request.body)
                  as Map<String, dynamic>)['refreshToken'],
              'account-a-refresh',
            );
            refreshCalls++;
            if (refreshCalls == 1) {
              accountARefresh0Started.complete();
              return accountARefresh0Response.future;
            }
            accountARefresh1Started.complete();
            return accountARefresh1Response.future;
          }
          if (request.url.path == '/api/auth/email') {
            return http.Response(
              '{"accessToken":"account-b-access","refreshToken":"account-b-refresh"}',
              200,
            );
          }
          if (request.url.path == '/api/auth/userinfo') {
            expect(request.headers['Authorization'], 'Bearer account-b-access');
            return http.Response(
              jsonEncode({
                'id': '018f0000-0000-7000-8000-000000000004',
                'email': 'account-b@example.invalid',
                'role': 'user',
                'tier': 'bronze',
                'created_at': '2026-08-01T00:00:00Z',
                'last_login_at': '2026-08-01T00:00:00Z',
              }),
              200,
            );
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final accountARefresh0 = service.refreshSession();
      await accountARefresh0Started.future;
      final accountBLogin = service.loginWithEmail(
        'account-b@example.invalid',
        'correct-horse-battery-staple',
      );
      await accountBRefreshWriteStarted.future;

      final accountARefresh1 = service.refreshSession();
      await accountARefresh1Started.future;
      final accountARefresh0Outcome = _resultOrError(accountARefresh0);
      final accountARefresh1Outcome = _resultOrError(accountARefresh1);
      releaseAccountBRefreshWrite.complete();
      expect((await accountBLogin).id, '018f0000-0000-7000-8000-000000000004');
      expect(await service.getJwtToken(), 'account-b-access');

      accountARefresh1Response.complete(
        http.Response(
          '{"accessToken":"late-account-a-access","refreshToken":"late-account-a-refresh"}',
          200,
        ),
      );
      accountARefresh0Response.complete(http.Response('{}', 503));
      expect(await accountARefresh1Outcome, isFalse);
      expect(await accountARefresh0Outcome, isFalse);
      expect(await service.getJwtToken(), 'account-b-access');
      expect(storage.values['refreshToken'], 'account-b-refresh');
      expect(refreshCalls, 2);
    },
  );

  test(
    'failed replacement login does not cancel an in-progress logout',
    () async {
      final jwtRead = Completer<String?>();
      final jwtReadStarted = Completer<void>();
      final storage = _AuthTestSecureStorage(
        {'jwt': 'account-a-access', 'refreshToken': 'account-a-refresh'},
        jwtRead: jwtRead,
        jwtReadStarted: jwtReadStarted,
      );
      final service = AuthService(
        secureStorage: storage,
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/email') {
            return http.Response('{"error":"invalid_credentials"}', 401);
          }
          if (request.url.path == '/api/auth/logout') {
            return http.Response('{"loggedOut":true}', 200);
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final logout = service.logout();
      await jwtReadStarted.future;
      await expectLater(
        service.loginWithEmail(
          'account-b@example.invalid',
          'correct-horse-battery-staple',
        ),
        throwsA(isA<AuthFailure>()),
      );
      jwtRead.complete('account-a-access');
      await logout;

      expect(await service.getJwtToken(), isNull);
      expect(storage.values, isEmpty);
      expect(service.remoteLogoutConfirmed, isTrue);
    },
  );

  test(
    'successful replacement login survives an older in-progress logout',
    () async {
      final jwtRead = Completer<String?>();
      final jwtReadStarted = Completer<void>();
      final storage = _AuthTestSecureStorage(
        {'jwt': 'account-a-access', 'refreshToken': 'account-a-refresh'},
        jwtRead: jwtRead,
        jwtReadStarted: jwtReadStarted,
      );
      final logoutRequestStarted = Completer<void>();
      final logoutResponse = Completer<http.Response>();
      final service = AuthService(
        secureStorage: storage,
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/email') {
            return http.Response(
              '{"accessToken":"account-b-access","refreshToken":"account-b-refresh"}',
              200,
            );
          }
          if (request.url.path == '/api/auth/userinfo') {
            expect(request.headers['Authorization'], 'Bearer account-b-access');
            return http.Response(
              jsonEncode({
                'id': '018f0000-0000-7000-8000-000000000005',
                'email': 'account-b@example.invalid',
                'role': 'user',
                'tier': 'bronze',
                'created_at': '2026-08-01T00:00:00Z',
                'last_login_at': '2026-08-01T00:00:00Z',
              }),
              200,
            );
          }
          if (request.url.path == '/api/auth/logout') {
            expect(request.headers['Authorization'], 'Bearer account-a-access');
            expect(jsonDecode(request.body), {
              'refreshToken': 'account-a-refresh',
            });
            logoutRequestStarted.complete();
            return logoutResponse.future;
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final logout = service.logout();
      await jwtReadStarted.future;
      final accountBLogin = service.loginWithEmail(
        'account-b@example.invalid',
        'correct-horse-battery-staple',
      );
      jwtRead.complete('account-a-access');
      expect((await accountBLogin).id, '018f0000-0000-7000-8000-000000000005');
      expect(storage.values['jwt'], 'account-b-access');
      expect(storage.values['refreshToken'], 'account-b-refresh');

      await logoutRequestStarted.future;
      logoutResponse.complete(http.Response('{"loggedOut":true}', 200));
      await logout;

      expect(await service.getJwtToken(), 'account-b-access');
      expect(storage.values['refreshToken'], 'account-b-refresh');
    },
  );

  test(
    'refresh started during logout cannot restore the signed-out account',
    () async {
      final jwtRead = Completer<String?>();
      final storage = _AuthTestSecureStorage({
        'jwt': 'account-a-access',
        'refreshToken': 'account-a-refresh',
      }, jwtRead: jwtRead);
      final accountARefresh0Started = Completer<void>();
      final accountARefresh0Response = Completer<http.Response>();
      final accountARefresh1Started = Completer<void>();
      final accountARefresh1Response = Completer<http.Response>();
      var refreshCalls = 0;
      final service = AuthService(
        secureStorage: storage,
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/auth/refresh') {
            expect(
              (jsonDecode(request.body)
                  as Map<String, dynamic>)['refreshToken'],
              'account-a-refresh',
            );
            refreshCalls++;
            if (refreshCalls == 1) {
              accountARefresh0Started.complete();
              return accountARefresh0Response.future;
            }
            accountARefresh1Started.complete();
            return accountARefresh1Response.future;
          }
          if (request.url.path == '/api/auth/logout') {
            return http.Response('{}', 200);
          }
          throw StateError('Unexpected request ${request.url.path}');
        }),
        authUrl: 'https://api.lythaus.co/api',
      );

      final accountARefresh0 = service.refreshSession();
      await accountARefresh0Started.future;
      final logout = service.logout();
      final accountARefresh1 = service.refreshSession();
      await accountARefresh1Started.future;
      jwtRead.complete('account-a-access');
      await logout;

      final accountARefresh1Outcome = _resultOrError(accountARefresh1);
      final accountARefresh0Outcome = _resultOrError(accountARefresh0);
      accountARefresh1Response.complete(
        http.Response(
          '{"accessToken":"late-account-a-access","refreshToken":"late-account-a-refresh"}',
          200,
        ),
      );
      accountARefresh0Response.completeError(
        StateError('account A transport failed after sign-out'),
      );
      expect(await accountARefresh1Outcome, isFalse);
      expect(await accountARefresh0Outcome, isFalse);
      expect(await service.getJwtToken(), isNull);
      expect(storage.values, isEmpty);
      expect(refreshCalls, 2);
    },
  );

  test(
    'a refresh response arriving after logout cannot restore credentials',
    () async {
      FlutterSecureStorage.setMockInitialValues({'refreshToken': 'original'});
      final started = Completer<void>();
      final response = Completer<http.Response>();
      final service = AuthService(
        httpClient: MockClient((_) {
          started.complete();
          return response.future;
        }),
        authUrl: 'https://api.lythaus.co/api',
      );
      final refresh = service.refreshSession();
      await started.future;
      await service.logout();
      response.complete(
        http.Response(
          '{"accessToken":"late-access","refreshToken":"late-refresh"}',
          200,
        ),
      );
      expect(await refresh, isFalse);
      expect(await service.getJwtToken(), isNull);
    },
  );

  test('resend verification email uses the neutral auth mode', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/api/auth/email');
      expect(jsonDecode(request.body), {
        'mode': 'resend_verification',
        'email': 'person@example.com',
        'turnstileToken': 'turnstile-token',
      });
      return http.Response(
        jsonEncode({
          'data': {'state': 'verification_required'},
        }),
        202,
      );
    });
    final service = AuthService(
      httpClient: client,
      authUrl: 'https://api.lythaus.co/api',
    );

    await service.resendVerificationEmail(
      ' person@example.com ',
      turnstileToken: 'turnstile-token',
    );
  });

  test(
    'resend verification rejects an empty email before network access',
    () async {
      final service = AuthService(
        httpClient: MockClient((_) async => throw StateError('not called')),
        authUrl: 'https://api.lythaus.co/api',
      );

      expect(
        () => service.resendVerificationEmail(
          ' ',
          turnstileToken: 'turnstile-token',
        ),
        throwsA(isA<AuthFailure>()),
      );
    },
  );
}

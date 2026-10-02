import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/passkey_platform.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

class SyntheticPasskeys implements PasskeyPlatform {
  bool available = true;
  bool cancelled = false;
  Completer<Map<String, dynamic>>? pending;
  int calls = 0;
  @override
  bool get supported => available;
  @override
  Future<Map<String, dynamic>> authenticate(
    Map<String, dynamic> options,
  ) async {
    calls++;
    if (cancelled) throw StateError('Synthetic cancellation');
    if (pending != null) return pending!.future;
    return {'id': 'synthetic-credential'};
  }

  @override
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) =>
      authenticate(options);
}

final user = {
  'id': '018f0000-0000-7000-8000-000000000001',
  'email': 'synthetic@example.invalid',
  'role': 'user',
  'tier': 'bronze',
  'created_at': '2026-08-01T00:00:00Z',
  'last_login_at': '2026-08-01T00:00:00Z',
};
const tokens = {
  'accessToken': 'synthetic-access',
  'sessionTransport': 'cookie-v1',
  'expiresIn': 900,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  AuthService service(
    SyntheticPasskeys platform,
    Future<http.Response> Function(http.Request) handle, {
    bool web = true,
  }) => AuthService(
    authUrl: 'https://api.lythaus.co/api',
    passkeyPlatform: platform,
    useWebSession: web,
    httpClient: MockClient(handle),
  );
  Future<http.Response> ordinary(http.Request request) async {
    final path = request.url.path;
    if (path.endsWith('/capabilities')) {
      return http.Response('{"enabled":true}', 200);
    }
    if (path.endsWith('/options')) {
      return http.Response(
        '{"challengeId":"synthetic-challenge","options":{"challenge":"synthetic"}}',
        200,
      );
    }
    if (path.endsWith('/userinfo')) return http.Response(jsonEncode(user), 200);
    return http.Response(jsonEncode(tokens), 200);
  }

  test(
    'unsupported or native clients retain email fallback without capability requests',
    () async {
      for (final native in [false, true]) {
        final platform = SyntheticPasskeys()..available = native;
        final auth = service(
          platform,
          (_) async => throw StateError('Unexpected request'),
          web: !native,
        );
        expect(await auth.passkeysAvailable(), false);
        expect(platform.calls, 0);
      }
    },
  );

  test(
    'disabled and failed capability checks hide the optional flow',
    () async {
      for (final status in [200, 404, 503]) {
        final auth = service(
          SyntheticPasskeys(),
          (_) async => http.Response('{"enabled":false}', status),
        );
        expect(await auth.passkeysAvailable(), false);
      }
    },
  );

  test(
    'passkey login uses cookie transport and keeps access tokens in memory',
    () async {
      final requests = <http.Request>[];
      final auth = service(SyntheticPasskeys(), (request) async {
        requests.add(request);
        return ordinary(request);
      });
      expect((await auth.loginWithPasskey()).id, user['id']);
      expect(await auth.getJwtToken(), 'synthetic-access');
      final stored = await const FlutterSecureStorage().readAll();
      expect(stored.keys, isNot(contains('jwt')));
      expect(stored.keys, isNot(contains('refreshToken')));
      expect(
        requests
            .where((request) => request.url.path.contains('/passkeys/'))
            .every(
              (request) =>
                  request.headers['X-Lythaus-Auth-Transport'] == 'cookie-v1',
            ),
        true,
      );
      expect(
        requests.any((request) => request.url.path.contains('/api/api/')),
        false,
      );
    },
  );

  test(
    'passkey sign-in requests the shared optional profile flow and sign-out clears it',
    () async {
      final auth = service(SyntheticPasskeys(), (request) async {
        if (request.url.path.endsWith('/refresh')) {
          return http.Response('{"error":"refresh_token_invalid"}', 401);
        }
        return ordinary(request);
      });
      final container = ProviderContainer(
        overrides: [enhancedAuthServiceProvider.overrideWithValue(auth)],
      );
      addTearDown(container.dispose);
      await container.read(passkeySignInProvider)();
      expect(container.read(currentUserProvider)?.id, user['id']);
      expect(container.read(profileSetupRequestedProvider), true);
      await container.read(authStateProvider.notifier).signOut();
      expect(container.read(profileSetupRequestedProvider), false);
      expect(container.read(currentUserProvider), isNull);
    },
  );

  test('browser cancellation leaves email/password sign-in usable', () async {
    final platform = SyntheticPasskeys()..cancelled = true;
    var verified = false;
    final auth = service(platform, (request) async {
      if (request.url.path.endsWith('/login/verify')) verified = true;
      return ordinary(request);
    });
    await expectLater(auth.loginWithPasskey(), throwsA(isA<AuthFailure>()));
    expect(verified, false);
    expect(await auth.getJwtToken(), null);
    expect(
      (await auth.loginWithEmail(
        'synthetic@example.invalid',
        'historical12',
      )).id,
      user['id'],
    );
  });

  test(
    'incomplete cookie session response never stores a passkey session',
    () async {
      final auth = service(SyntheticPasskeys(), (request) async {
        if (request.url.path.endsWith('/login/verify')) {
          return http.Response('{"accessToken":"bad"}', 200);
        }
        return ordinary(request);
      });
      await expectLater(auth.loginWithPasskey(), throwsA(isA<AuthFailure>()));
      expect(await auth.getJwtToken(), null);
    },
  );

  test(
    'other-tab sign-out cancels an in-flight ceremony before verification',
    () async {
      final platform = SyntheticPasskeys()
        ..pending = Completer<Map<String, dynamic>>();
      var verified = false;
      final auth = service(platform, (request) async {
        if (request.url.path.endsWith('/login/verify')) verified = true;
        return ordinary(request);
      });
      final login = auth.loginWithPasskey();
      final assertion = expectLater(login, throwsA(isA<AuthFailure>()));
      while (platform.calls == 0) {
        await Future<void>.delayed(Duration.zero);
      }
      await auth.clearAfterOtherTabSignOut();
      platform.pending!.complete({'id': 'synthetic'});
      await assertion;
      expect(verified, false);
      expect(await auth.getJwtToken(), null);
    },
  );

  test(
    'management keeps authentication and ceremony data in separate requests',
    () async {
      final requests = <http.Request>[];
      final auth = service(SyntheticPasskeys(), (request) async {
        requests.add(request);
        if (request.url.path.endsWith('/credentials')) {
          return http.Response(
            '{"credentials":[{"id":"fixture-id","name":"My device","deviceType":"multiDevice"}]}',
            200,
          );
        }
        return ordinary(request);
      });
      await auth.loginWithEmail('synthetic@example.invalid', 'historical12');
      requests.clear();
      await auth.enrollPasskey('My device', 'historical12');
      await auth.verifyPasskeyMaintenance();
      await auth.renamePasskey('fixture-id', 'Renamed');
      final credentials = await auth.listPasskeys();
      expect(credentials.single.synced, true);
      await auth.revokePasskey('fixture-id', 'historical12');
      expect(
        requests.every(
          (request) =>
              request.headers['Authorization'] == 'Bearer synthetic-access',
        ),
        true,
      );
      final registration = requests.firstWhere(
        (request) => request.url.path.endsWith('/register/options'),
      );
      expect(jsonDecode(registration.body)['password'], 'historical12');
      final verification = requests.firstWhere(
        (request) => request.url.path.endsWith('/register/verify'),
      );
      expect(jsonDecode(verification.body).containsKey('password'), false);
    },
  );
}

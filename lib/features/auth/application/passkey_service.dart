// ignore_for_file: public_member_api_docs

part of 'auth_service.dart';

class PasskeyInfo {
  const PasskeyInfo({
    required this.id,
    required this.name,
    required this.synced,
  });
  factory PasskeyInfo.fromJson(Map<String, dynamic> json) => PasskeyInfo(
    id: json['id'] as String,
    name: json['name'] as String,
    synced: json['deviceType'] == 'multiDevice',
  );
  final String id;
  final String name;
  final bool synced;
}

extension PasskeyAuthentication on AuthService {
  Future<bool> passkeysAvailable() async {
    if (!_useWebSession || !_passkeyPlatform.supported) return false;
    try {
      final result = await _passkeyRequest('GET', '/capabilities');
      return result['enabled'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> _passkeyRequest(
    String method,
    String route, {
    Map<String, dynamic>? body,
    bool authenticated = false,
  }) async {
    final token = authenticated ? await getJwtToken() : null;
    if (authenticated && token == null) {
      throw AuthFailure.invalidCredentials('Sign in again to manage passkeys.');
    }
    final request = http.Request(
      method,
      Uri.parse('$_authUrl/auth/passkeys$route'),
    );
    request.headers.addAll({
      ..._authHeaders,
      if (token != null) 'Authorization': 'Bearer $token',
    });
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(
      await _httpClient.send(request).timeout(_requestTimeout),
    ).timeout(_requestTimeout);
    if (response.statusCode != 200) {
      if (response.statusCode == 401) {
        throw AuthFailure.invalidCredentials(
          'Passkey verification failed. You can use email and password.',
        );
      }
      throw AuthFailure.serverError(
        'Passkeys are unavailable. You can use email and password.',
      );
    }
    return AuthService._payload(response);
  }

  Future<User> loginWithPasskey() => withSessionLock(() async {
    if (!await passkeysAvailable()) {
      throw AuthFailure.serverError(
        'Passkeys are unavailable in this browser.',
      );
    }
    final epoch = ++_sessionEpoch;
    try {
      final challenge = await _passkeyRequest(
        'POST',
        '/login/options',
        body: {},
      );
      final credential = await _passkeyPlatform.authenticate(
        challenge['options'] as Map<String, dynamic>,
      );
      if (epoch != _sessionEpoch) throw AuthFailure.cancelledByUser();
      final payload = await _passkeyRequest(
        'POST',
        '/login/verify',
        body: {
          'challengeId': challenge['challengeId'],
          'credential': credential,
        },
      );
      return _acceptSession(payload, epoch);
    } on AuthFailure {
      rethrow;
    } catch (_) {
      throw AuthFailure.serverError(
        'Passkey sign-in was cancelled or unavailable. Try email and password.',
      );
    }
  });

  Future<List<PasskeyInfo>> listPasskeys() async {
    final result = await _passkeyRequest(
      'GET',
      '/credentials',
      authenticated: true,
    );
    return (result['credentials'] as List)
        .map((value) => PasskeyInfo.fromJson(value as Map<String, dynamic>))
        .toList();
  }

  Future<void> enrollPasskey(String name, String password) =>
      withSessionLock(() async {
        final challenge = await _passkeyRequest(
          'POST',
          '/register/options',
          authenticated: true,
          body: {'name': name, 'password': password},
        );
        final credential = await _passkeyPlatform.register(
          challenge['options'] as Map<String, dynamic>,
        );
        await _passkeyRequest(
          'POST',
          '/register/verify',
          authenticated: true,
          body: {
            'challengeId': challenge['challengeId'],
            'credential': credential,
          },
        );
      });

  Future<void> verifyPasskeyMaintenance() => withSessionLock(() async {
    final challenge = await _passkeyRequest(
      'POST',
      '/maintenance/options',
      authenticated: true,
      body: {},
    );
    final credential = await _passkeyPlatform.authenticate(
      challenge['options'] as Map<String, dynamic>,
    );
    await _passkeyRequest(
      'POST',
      '/maintenance/verify',
      authenticated: true,
      body: {'challengeId': challenge['challengeId'], 'credential': credential},
    );
  });

  Future<void> renamePasskey(String id, String name) async {
    await _passkeyRequest(
      'PATCH',
      '/credentials/$id',
      authenticated: true,
      body: {'name': name},
    );
  }

  Future<void> revokePasskey(String id, String password) =>
      withSessionLock(() async {
        await _passkeyRequest(
          'POST',
          '/credentials/$id/revoke',
          authenticated: true,
          body: {'password': password},
        );
      });
}

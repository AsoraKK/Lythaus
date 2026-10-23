// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';

import 'package:lythaus/core/config/web_release_guard.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/password_policy.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/application/session_platform.dart';

class AuthService {
  AuthService({
    FlutterSecureStorage? secureStorage,
    LocalAuthentication? localAuth,
    http.Client? httpClient,
    String authUrl = _defaultAuthUrl,
    Duration requestTimeout = const Duration(seconds: 20),
    bool useWebSession = kIsWeb,
  }) : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
       _localAuth = localAuth ?? LocalAuthentication(),
       _httpClient = httpClient ?? createSessionClient(),
       _authUrl = _resolveAuthUrl(authUrl),
       _requestTimeout = requestTimeout,
       _useWebSession = useWebSession;

  final FlutterSecureStorage _secureStorage;
  final LocalAuthentication _localAuth;
  final http.Client _httpClient;
  final String _authUrl;
  final Duration _requestTimeout;
  final bool _useWebSession;
  String? _memoryAccessToken;
  Future<void> _storageWrites = Future.value();
  Future<bool>? _refreshInFlight;
  int? _refreshInFlightEpoch;
  int? _refreshInFlightOwnerRevision;
  int _sessionEpoch = 0;
  int _sessionOwnerRevision = 0;
  int? _logoutFenceOwnerRevision;
  int? _activeLogoutEpoch;
  bool remoteLogoutConfirmed = true;
  bool _signedOut = false;

  static const _jwtKey = 'jwt';
  static const _refreshTokenKey = 'refreshToken';
  static const _userKey = 'userData';
  static const _defaultAuthUrl = String.fromEnvironment('AUTH_URL');

  Map<String, String> get _authHeaders => {
    'Content-Type': 'application/json',
    if (_useWebSession) 'X-Lythaus-Auth-Transport': 'cookie-v1',
  };

  Future<T> _serializeStorage<T>(Future<T> Function() operation) {
    final result = _storageWrites.then((_) => operation());
    _storageWrites = result.then<void>((_) {}).catchError((Object _) {});
    return result;
  }

  bool get _logoutFenceIsActive =>
      _logoutFenceOwnerRevision != null &&
      _logoutFenceOwnerRevision == _sessionOwnerRevision;

  Future<bool> _storeSession(
    int epoch,
    String access,
    String? refresh, {
    User? user,
    bool loginCommit = false,
    int? expectedOwnerRevision,
    String? expectedRefreshToken,
  }) async {
    var committed = false;
    await _serializeStorage(() async {
      if (epoch != _sessionEpoch ||
          (expectedOwnerRevision != null &&
              expectedOwnerRevision != _sessionOwnerRevision) ||
          (!loginCommit && _logoutFenceIsActive)) {
        return;
      }
      if (expectedRefreshToken != null && !_useWebSession) {
        final currentRefreshToken = await _secureStorage.read(
          key: _refreshTokenKey,
        );
        if (epoch != _sessionEpoch ||
            expectedOwnerRevision != _sessionOwnerRevision ||
            currentRefreshToken != expectedRefreshToken ||
            _logoutFenceIsActive) {
          return;
        }
      }
      if (_useWebSession) {
        await Future.wait([
          _safeDelete(_jwtKey),
          _safeDelete(_refreshTokenKey),
          _safeDelete(_userKey),
        ]);
        if (epoch != _sessionEpoch) return;
        _memoryAccessToken = access;
        markBrowserLogout(false);
      } else {
        await Future.wait([
          _secureStorage.write(key: _jwtKey, value: access),
          _secureStorage.write(key: _refreshTokenKey, value: refresh),
          if (user != null)
            _secureStorage.write(
              key: _userKey,
              value: jsonEncode(user.toJson()),
            ),
        ]);
        if (epoch != _sessionEpoch) return;
      }
      _signedOut = false;
      if (loginCommit) {
        _sessionOwnerRevision += 1;
        _logoutFenceOwnerRevision = null;
        _activeLogoutEpoch = null;
      }
      committed = true;
    });
    return committed;
  }

  static String _resolveAuthUrl(String configured) {
    final value = configured.trim().isEmpty
        ? EnvironmentConfig.fromEnvironment().apiBaseUrl
        : configured.trim();
    final resolved = isReleaseWebBuild
        ? requirePublicHttpsOrigin('AUTH_URL', value).toString()
        : value;
    return resolved.replaceFirst(RegExp(r'/$'), '');
  }

  Future<User> loginWithEmail(String email, String password) =>
      withSessionLock(() => _loginWithEmail(email, password));

  Future<User> _loginWithEmail(String email, String password) async {
    if (email.trim().isEmpty) {
      throw AuthFailure.invalidCredentials('Email cannot be empty');
    }
    if (!PasswordPolicy.acceptsLogin(password)) {
      throw AuthFailure.invalidCredentials(
        'Enter your existing password (up to 128 characters).',
      );
    }
    final epoch = ++_sessionEpoch;
    try {
      final response = await _httpClient
          .post(
            Uri.parse('$_authUrl/auth/email'),
            headers: _authHeaders,
            body: jsonEncode({
              'mode': 'login',
              'email': email.trim(),
              'password': password,
            }),
          )
          .timeout(_requestTimeout);
      if (response.statusCode == 401) {
        throw AuthFailure.invalidCredentials('Invalid email or password');
      }
      if (response.statusCode != 200) {
        throw AuthFailure.serverError(_errorMessage(response));
      }
      final payload = _payload(response);
      final accessToken =
          payload['accessToken'] as String? ??
          payload['access_token'] as String?;
      final refreshToken =
          payload['refreshToken'] as String? ??
          payload['refresh_token'] as String?;
      if (accessToken == null ||
          (!_useWebSession && refreshToken == null) ||
          (_useWebSession && payload['sessionTransport'] != 'cookie-v1')) {
        throw AuthFailure.serverError('Authentication response is incomplete');
      }
      final user = await _fetchCurrentUser(accessToken);
      if (epoch != _sessionEpoch) throw AuthFailure.cancelledByUser();
      final sessionEpoch = ++_sessionEpoch;
      final stored = await _storeSession(
        sessionEpoch,
        accessToken,
        refreshToken,
        user: user,
        loginCommit: true,
      );
      if (!stored) throw AuthFailure.cancelledByUser();
      return user;
    } on AuthFailure {
      rethrow;
    } on TimeoutException {
      throw AuthFailure.networkError(
        'Sign-in timed out. Check your connection and try again.',
      );
    } catch (_) {
      throw AuthFailure.serverError('Unable to sign in. Please try again.');
    }
  }

  /// Request another verification email without revealing account state.
  Future<void> resendVerificationEmail(
    String email, {
    required String turnstileToken,
  }) async {
    final normalizedEmail = email.trim();
    if (normalizedEmail.isEmpty) {
      throw AuthFailure.invalidCredentials('Email cannot be empty');
    }
    if (turnstileToken.trim().isEmpty) {
      throw AuthFailure.invalidCredentials('Verification is required');
    }

    try {
      final response = await _httpClient
          .post(
            Uri.parse('$_authUrl/auth/email'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'mode': 'resend_verification',
              'email': normalizedEmail,
              'turnstileToken': turnstileToken,
            }),
          )
          .timeout(_requestTimeout);
      if (response.statusCode != 202 && response.statusCode != 200) {
        throw AuthFailure.serverError(_errorMessage(response));
      }
    } on AuthFailure {
      rethrow;
    } on TimeoutException {
      throw AuthFailure.networkError(
        'The request timed out. Delivery is not confirmed. Please wait before retrying.',
      );
    } catch (_) {
      throw AuthFailure.serverError(
        'Unable to resend verification email. Please try again.',
      );
    }
  }

  Future<User?> getCurrentUser() async {
    if (_useWebSession && pendingBrowserLogout()) {
      await logout();
      if (!remoteLogoutConfirmed) {
        throw AuthFailure.networkError(
          'Signed out on this device. Reconnect to finish signing out of the server session.',
        );
      }
      return null;
    }
    final epoch = _sessionEpoch;
    final ownerRevision = _sessionOwnerRevision;
    var token = await getJwtToken();
    if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
    if (token == null && _useWebSession && await refreshSession()) {
      if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
      token = await getJwtToken();
      if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
    }
    if (token == null) return null;
    try {
      final user = await _fetchCurrentUser(token);
      if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
      if (!_useWebSession) {
        await _serializeStorage(() async {
          if (_ownsCurrentSession(epoch, ownerRevision)) {
            await _secureStorage.write(
              key: _userKey,
              value: jsonEncode(user.toJson()),
            );
          }
        });
      }
      return user;
    } on AuthFailure catch (error) {
      if (!error.invalidSession) rethrow;
      if (await refreshSession()) {
        if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
        final replacement = await getJwtToken();
        if (replacement != null) {
          try {
            final user = await _fetchCurrentUser(replacement);
            if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
            if (!_useWebSession) {
              await _serializeStorage(() async {
                if (_ownsCurrentSession(epoch, ownerRevision)) {
                  await _secureStorage.write(
                    key: _userKey,
                    value: jsonEncode(user.toJson()),
                  );
                }
              });
            }
            return user;
          } on AuthFailure catch (error) {
            if (!error.invalidSession) rethrow;
            // Fall through to local sign-out.
          }
        }
      }
      if (!_ownsCurrentSession(epoch, ownerRevision)) return null;
      await logout();
      return null;
    } catch (_) {
      throw AuthFailure.networkError(
        'Unable to check your session. Check your connection and try again.',
      );
    }
  }

  Future<User> _fetchCurrentUser(String token) async {
    final response = await _httpClient
        .get(
          Uri.parse('$_authUrl/auth/userinfo'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
        )
        .timeout(_requestTimeout);
    if (response.statusCode == 401) {
      throw AuthFailure.sessionExpired();
    }
    if (response.statusCode != 200) {
      throw AuthFailure.serverError(_errorMessage(response));
    }
    return User.fromJson(_payload(response));
  }

  Future<bool> refreshSession() {
    final epoch = _sessionEpoch;
    final ownerRevision = _sessionOwnerRevision;
    final inFlight = _refreshInFlight;
    if (inFlight != null &&
        _refreshInFlightEpoch == epoch &&
        _refreshInFlightOwnerRevision == ownerRevision) {
      return inFlight;
    }

    late final Future<bool> next;
    next = withSessionLock(() => _refreshSession(epoch, ownerRevision))
        .whenComplete(() {
          if (identical(_refreshInFlight, next)) {
            _refreshInFlight = null;
            _refreshInFlightEpoch = null;
            _refreshInFlightOwnerRevision = null;
          }
        });
    _refreshInFlight = next;
    _refreshInFlightEpoch = epoch;
    _refreshInFlightOwnerRevision = ownerRevision;
    return next;
  }

  bool _canCommitRefresh(int epoch, int ownerRevision) =>
      epoch == _sessionEpoch &&
      ownerRevision == _sessionOwnerRevision &&
      !_signedOut &&
      !_logoutFenceIsActive;

  bool _ownsCurrentSession(int epoch, int ownerRevision) =>
      epoch == _sessionEpoch && ownerRevision == _sessionOwnerRevision;

  Future<bool> _refreshSession(int epoch, int ownerRevision) async {
    if (epoch != _sessionEpoch || _signedOut) return false;
    if (_useWebSession && pendingBrowserLogout()) return false;
    try {
      final refreshToken = _useWebSession
          ? null
          : await _secureStorage.read(key: _refreshTokenKey);
      if (epoch != _sessionEpoch ||
          ownerRevision != _sessionOwnerRevision ||
          _signedOut) {
        return false;
      }
      if (!_useWebSession && refreshToken == null) return false;
      final response = await _httpClient
          .post(
            Uri.parse('$_authUrl/auth/refresh'),
            headers: _authHeaders,
            body: jsonEncode(
              _useWebSession ? {} : {'refreshToken': refreshToken},
            ),
          )
          .timeout(_requestTimeout);
      if (!_canCommitRefresh(epoch, ownerRevision)) return false;
      if (response.statusCode == 401) return false;
      if (response.statusCode != 200) {
        throw AuthFailure.serverError(_errorMessage(response));
      }
      final payload = _payload(response);
      final accessToken =
          payload['accessToken'] as String? ??
          payload['access_token'] as String?;
      final replacement =
          payload['refreshToken'] as String? ??
          payload['refresh_token'] as String?;
      if (accessToken == null ||
          (!_useWebSession && replacement == null) ||
          (_useWebSession && payload['sessionTransport'] != 'cookie-v1') ||
          !_canCommitRefresh(epoch, ownerRevision)) {
        return false;
      }
      return _storeSession(
        epoch,
        accessToken,
        replacement,
        expectedOwnerRevision: ownerRevision,
        expectedRefreshToken: _useWebSession ? null : refreshToken,
      );
    } on AuthFailure {
      if (!_canCommitRefresh(epoch, ownerRevision)) return false;
      rethrow;
    } catch (_) {
      if (!_canCommitRefresh(epoch, ownerRevision)) return false;
      throw AuthFailure.networkError(
        'Unable to refresh your session. Please check your connection and try again.',
      );
    }
  }

  Future<void> logout() async {
    final logoutEpoch = ++_sessionEpoch;
    final logoutOwnerRevision = _sessionOwnerRevision;
    _logoutFenceOwnerRevision = logoutOwnerRevision;
    _activeLogoutEpoch = logoutEpoch;
    if (_useWebSession) markBrowserLogout(true);
    remoteLogoutConfirmed = false;
    final (token, refreshToken) = await _serializeStorage(() async {
      final token = await _readStoredAccessToken();
      final refreshToken = _useWebSession
          ? null
          : await _secureStorage
                .read(key: _refreshTokenKey)
                .catchError((_) => null);
      return (token, refreshToken);
    });
    if (logoutOwnerRevision == _sessionOwnerRevision) {
      await _serializeStorage(() async {
        if (logoutOwnerRevision != _sessionOwnerRevision) return;
        _signedOut = true;
        _memoryAccessToken = null;
        await Future.wait([
          _safeDelete(_jwtKey),
          _safeDelete(_refreshTokenKey),
          _safeDelete(_userKey),
        ]);
      });
    }
    if (token != null || refreshToken != null || _useWebSession) {
      try {
        final result = await withSessionLock(
          () => _httpClient
              .post(
                Uri.parse('$_authUrl/auth/logout'),
                headers: {
                  ..._authHeaders,
                  if (token != null) 'Authorization': 'Bearer $token',
                },
                body: jsonEncode({
                  if (refreshToken != null) 'refreshToken': refreshToken,
                }),
              )
              .timeout(_requestTimeout),
        );
        if (logoutOwnerRevision == _sessionOwnerRevision &&
            _activeLogoutEpoch == logoutEpoch) {
          remoteLogoutConfirmed = result.statusCode == 200;
          if (_useWebSession && remoteLogoutConfirmed) {
            markBrowserLogout(false);
          }
        }
      } catch (_) {
        // Local session removal remains authoritative for the client.
      }
    } else if (logoutOwnerRevision == _sessionOwnerRevision &&
        _activeLogoutEpoch == logoutEpoch) {
      remoteLogoutConfirmed = true;
    }
  }

  Future<void> clearAfterOtherTabSignOut() async {
    _sessionEpoch += 1;
    _signedOut = true;
    _memoryAccessToken = null;
    await _serializeStorage(
      () => Future.wait([
        _safeDelete(_jwtKey),
        _safeDelete(_refreshTokenKey),
        _safeDelete(_userKey),
      ]),
    );
  }

  Future<void> _safeDelete(String key) async {
    try {
      await _secureStorage.delete(key: key);
    } catch (_) {
      // Best effort so users can always leave an authenticated state.
    }
  }

  Future<bool> isAuthenticated() async => (await getJwtToken()) != null;

  Future<String?> _readStoredAccessToken() async {
    if (_useWebSession) return _memoryAccessToken;
    try {
      return await _secureStorage.read(key: _jwtKey);
    } catch (_) {
      return null;
    }
  }

  Future<String?> getJwtToken() async {
    final ownerRevision = _sessionOwnerRevision;
    if (_signedOut || _logoutFenceIsActive) return null;
    final token = await _readStoredAccessToken();
    if (ownerRevision != _sessionOwnerRevision ||
        _signedOut ||
        _logoutFenceIsActive) {
      return null;
    }
    return token;
  }

  /// Read the existing session for an account-bound action. This never refreshes,
  /// rotates, writes or extends either credential. Web credentials stay HttpOnly.
  Future<Map<String, String>?> accountActionSessionHeaders() async {
    final owner = _sessionOwnerRevision;
    if (_signedOut || _logoutFenceIsActive) return null;
    return _serializeStorage(() async {
      final access = await _readStoredAccessToken();
      final refresh = _useWebSession
          ? null
          : await _secureStorage.read(key: _refreshTokenKey);
      if (owner != _sessionOwnerRevision ||
          _signedOut ||
          _logoutFenceIsActive ||
          access == null ||
          access.isEmpty ||
          (!_useWebSession && (refresh == null || refresh.isEmpty))) {
        return null;
      }
      return {
        'Authorization': 'Bearer $access',
        if (_useWebSession) 'X-Lythaus-Auth-Transport': 'cookie-v1',
        if (refresh != null) 'X-Lythaus-Session-Binding': refresh,
      };
    });
  }

  Future<bool> validateAndRefreshToken() async {
    final token = await getJwtToken();
    if (token == null) return _useWebSession ? refreshSession() : false;
    try {
      await _fetchCurrentUser(token);
      return true;
    } on AuthFailure catch (error) {
      if (!error.invalidSession) rethrow;
      return refreshSession();
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticateWithBiometrics() async {
    if (kIsWeb) return false;
    if (!await _localAuth.canCheckBiometrics) return false;
    return _localAuth.authenticate(
      localizedReason: 'Please authenticate to continue',
      options: const AuthenticationOptions(biometricOnly: true),
    );
  }

  static Map<String, dynamic> _payload(http.Response response) {
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return decoded['data'] is Map<String, dynamic>
        ? decoded['data'] as Map<String, dynamic>
        : decoded;
  }

  static String _errorMessage(http.Response response) {
    try {
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      return switch (decoded['error']) {
        'email_verification_required' =>
          'Verify your email before signing in. Use Resend verification email if you need a new link.',
        'invalid_credentials' => 'Invalid email or password.',
        'rate_limit_exceeded' =>
          'Too many attempts. Please wait before trying again.',
        'turnstile_required' || 'turnstile_failed' || 'turnstile_unavailable' =>
          'Complete the verification challenge and try again.',
        _ => 'Authentication is temporarily unavailable. Please try again.',
      };
    } catch (_) {
      return 'Authentication is temporarily unavailable. Please try again.';
    }
  }
}

final authServiceProvider = Provider<AuthService>((_) => AuthService());

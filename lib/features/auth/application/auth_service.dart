// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:convert';
import 'dart:developer' as dev;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';

import 'package:lythaus/core/config/web_release_guard.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/user.dart';

class AuthService {
  AuthService({
    FlutterSecureStorage? secureStorage,
    LocalAuthentication? localAuth,
    http.Client? httpClient,
    String authUrl = _defaultAuthUrl,
  }) : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
       _localAuth = localAuth ?? LocalAuthentication(),
       _httpClient = httpClient ?? http.Client(),
       _authUrl = _resolveAuthUrl(authUrl);

  final FlutterSecureStorage _secureStorage;
  final LocalAuthentication _localAuth;
  final http.Client _httpClient;
  final String _authUrl;

  static const _jwtKey = 'jwt';
  static const _refreshTokenKey = 'refreshToken';
  static const _userKey = 'userData';
  static const _defaultAuthUrl = String.fromEnvironment('AUTH_URL');

  static String _resolveAuthUrl(String configured) {
    final value = configured.trim().isEmpty
        ? EnvironmentConfig.fromEnvironment().apiBaseUrl
        : configured.trim();
    final resolved = isReleaseWebBuild
        ? requirePublicHttpsOrigin('AUTH_URL', value).toString()
        : value;
    return resolved.replaceFirst(RegExp(r'/$'), '');
  }

  Future<User> loginWithEmail(String email, String password) async {
    if (email.trim().isEmpty) {
      throw AuthFailure.invalidCredentials('Email cannot be empty');
    }
    if (password.length < 12) {
      throw AuthFailure.invalidCredentials(
        'Password must contain at least 12 characters',
      );
    }
    try {
      final response = await _httpClient.post(
        Uri.parse('$_authUrl/auth/email'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'mode': 'login',
          'email': email.trim(),
          'password': password,
        }),
      );
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
      if (accessToken == null || refreshToken == null) {
        throw AuthFailure.serverError('Authentication response is incomplete');
      }
      await Future.wait([
        _secureStorage.write(key: _jwtKey, value: accessToken),
        _secureStorage.write(key: _refreshTokenKey, value: refreshToken),
      ]);
      final user = await _fetchCurrentUser(accessToken);
      await _secureStorage.write(
        key: _userKey,
        value: jsonEncode(user.toJson()),
      );
      return user;
    } on AuthFailure {
      rethrow;
    } catch (error, stackTrace) {
      dev.log(
        'Email login failed',
        name: 'auth',
        error: error,
        stackTrace: stackTrace,
      );
      throw AuthFailure.serverError('Unable to sign in. Please try again.');
    }
  }

  Future<User?> getCurrentUser() async {
    final token = await getJwtToken();
    if (token == null) return null;
    try {
      final user = await _fetchCurrentUser(token);
      await _secureStorage.write(
        key: _userKey,
        value: jsonEncode(user.toJson()),
      );
      return user;
    } on AuthFailure {
      if (await refreshSession()) {
        final replacement = await getJwtToken();
        if (replacement != null) {
          try {
            final user = await _fetchCurrentUser(replacement);
            await _secureStorage.write(
              key: _userKey,
              value: jsonEncode(user.toJson()),
            );
            return user;
          } catch (_) {
            // Fall through to local sign-out.
          }
        }
      }
      await logout();
      return null;
    } catch (_) {
      return _cachedUser();
    }
  }

  Future<User> _fetchCurrentUser(String token) async {
    final response = await _httpClient.get(
      Uri.parse('$_authUrl/auth/userinfo'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );
    if (response.statusCode == 401) {
      throw AuthFailure.invalidCredentials('Session expired');
    }
    if (response.statusCode != 200) {
      throw AuthFailure.serverError(_errorMessage(response));
    }
    return User.fromJson(_payload(response));
  }

  Future<User?> _cachedUser() async {
    final encoded = await _secureStorage.read(key: _userKey);
    if (encoded == null) return null;
    try {
      return User.fromJson(jsonDecode(encoded) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> refreshSession() async {
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;
    try {
      final response = await _httpClient.post(
        Uri.parse('$_authUrl/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (response.statusCode != 200) return false;
      final payload = _payload(response);
      final accessToken =
          payload['accessToken'] as String? ??
          payload['access_token'] as String?;
      final replacement =
          payload['refreshToken'] as String? ??
          payload['refresh_token'] as String?;
      if (accessToken == null || replacement == null) return false;
      await Future.wait([
        _secureStorage.write(key: _jwtKey, value: accessToken),
        _secureStorage.write(key: _refreshTokenKey, value: replacement),
      ]);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    final token = await getJwtToken();
    if (token != null) {
      try {
        await _httpClient.post(
          Uri.parse('$_authUrl/auth/logout'),
          headers: {'Authorization': 'Bearer $token'},
        );
      } catch (_) {
        // Local session removal remains authoritative for the client.
      }
    }
    await Future.wait([
      _safeDelete(_jwtKey),
      _safeDelete(_refreshTokenKey),
      _safeDelete(_userKey),
    ]);
  }

  Future<void> _safeDelete(String key) async {
    try {
      await _secureStorage.delete(key: key);
    } catch (_) {
      // Best effort so users can always leave an authenticated state.
    }
  }

  Future<bool> isAuthenticated() async => (await getJwtToken()) != null;

  Future<String?> getJwtToken() async {
    try {
      return await _secureStorage.read(key: _jwtKey);
    } catch (_) {
      return null;
    }
  }

  Future<bool> validateAndRefreshToken() async {
    final token = await getJwtToken();
    if (token == null) return false;
    try {
      await _fetchCurrentUser(token);
      return true;
    } on AuthFailure {
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
      return decoded['error'] as String? ?? 'Authentication failed';
    } catch (_) {
      return 'Authentication failed (${response.statusCode})';
    }
  }
}

final authServiceProvider = Provider<AuthService>((_) => AuthService());

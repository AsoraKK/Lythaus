// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/network/idempotency_key.dart';

typedef AccountPasswordPrompt =
    Future<String?> Function(
      Future<String> Function(String password) verify,
      CancelToken cancellation,
    );

class AccountActionVerification {
  const AccountActionVerification(this.client, this.prompt);
  final RecentAccountActionClient client;
  final AccountPasswordPrompt prompt;
}

class RecentAccountActionException implements Exception {
  const RecentAccountActionException(
    this.message, {
    this.confirmedNoEffect = false,
  });
  final String message;
  final bool confirmedNoEffect;
  @override
  String toString() => message;
}

class RecentAccountActionClient {
  RecentAccountActionClient({
    required Dio dio,
    required Future<Map<String, String>?> Function() sessionHeaders,
    required bool Function() isCurrent,
    required CancelToken sessionCancellation,
  }) : _dio = dio,
       _sessionHeaders = sessionHeaders,
       _isCurrent = isCurrent,
       _sessionCancellation = sessionCancellation;

  final Dio _dio;
  final Future<Map<String, String>?> Function() _sessionHeaders;
  final bool Function() _isCurrent;
  final CancelToken _sessionCancellation;
  bool _busy = false;

  void _check(CancelToken cancellation) {
    if (cancellation.isCancelled ||
        _sessionCancellation.isCancelled ||
        !_isCurrent()) {
      throw const RecentAccountActionException(
        'Verification cancelled. No new action was submitted.',
      );
    }
  }

  Future<Response<Map<String, dynamic>>> post({
    required String path,
    required String body,
    required String idempotencyKey,
    required void Function(String key) onRetryKey,
    required AccountPasswordPrompt passwordPrompt,
  }) async {
    if (_busy) {
      throw const RecentAccountActionException(
        'Another account action is in progress.',
      );
    }
    final action =
        RegExp(r'^/api/rewards/[a-zA-Z0-9_-]{1,128}/redeem$').hasMatch(path)
        ? 'reward_claim'
        : path == '/api/privacy/requests' && body == '{"requestType":"delete"}'
        ? 'account_delete'
        : null;
    if (action == null) throw ArgumentError('Unsupported account action');
    final cancellation = CancelToken();
    _sessionCancellation.whenCancel.then(
      (_) => cancellation.cancel('session_changed'),
    );
    _busy = true;
    var challenged = false;
    var retryStarted = false;
    try {
      try {
        return await _send(path, body, idempotencyKey, cancellation);
      } on DioException catch (error) {
        if (error.response?.statusCode != 403 ||
            error.response?.data?['error'] !=
                'recent_authentication_required') {
          rethrow;
        }
      }
      challenged = true;
      // Only this exact, confirmed no-effect 403 permits a new operation key.
      _check(cancellation);
      final proof = await passwordPrompt((password) async {
        _check(cancellation);
        try {
          final headers = await _headers(cancellation);
          final response = await _dio.post<Map<String, dynamic>>(
            '/api/auth/recent-verification',
            data: {
              'password': password,
              'operation': {'method': 'POST', 'path': path, 'body': body},
            },
            cancelToken: cancellation,
            options: Options(
              headers: headers,
              followRedirects: false,
              maxRedirects: 0,
              validateStatus: _successfulStatus,
            ),
          );
          _check(cancellation);
          final value = response.data?['proof'];
          if (value is! String ||
              !RegExp(r'^[0-9a-f-]{36}\.[0-9a-f]{64}$').hasMatch(value) ||
              response.data?['action'] != action) {
            throw const RecentAccountActionException(
              'Account verification is unavailable. Try again later.',
            );
          }
          return value;
        } on DioException catch (error) {
          // Never surface a request object containing password/session headers.
          throw RecentAccountActionException(switch (error
              .response
              ?.statusCode) {
            403 =>
              'Password verification failed. Try your existing account password.',
            429 => 'Too many verification attempts. Try again later.',
            401 => 'Your session could not be verified. Sign in again.',
            503 => 'Account verification is unavailable. Try again later.',
            _ =>
              'Verification could not be confirmed. Check your connection and try again.',
          });
        }
      }, cancellation);
      _check(cancellation);
      if (proof == null) {
        throw const RecentAccountActionException(
          'Verification cancelled. No new action was submitted.',
        );
      }
      final nextKey = IdempotencyKey.create('verified.action');
      onRetryKey(
        nextKey,
      ); // Caller retains this key if the retry outcome is unknown.
      retryStarted = true;
      return await _send(path, body, nextKey, cancellation, proof: proof);
    } on RecentAccountActionException catch (error) {
      throw RecentAccountActionException(
        error.message,
        confirmedNoEffect: challenged && !retryStarted,
      );
    } finally {
      _busy = false;
    }
  }

  Future<Map<String, String>> _headers(CancelToken cancellation) async {
    _check(cancellation);
    final headers = await _sessionHeaders();
    _check(cancellation);
    if (headers == null) {
      throw const RecentAccountActionException(
        'Your session could not be verified. Sign in again.',
      );
    }
    return headers;
  }

  Future<Response<Map<String, dynamic>>> _send(
    String path,
    String body,
    String key,
    CancelToken cancellation, {
    String? proof,
  }) async {
    final headers = await _headers(cancellation);
    final response = await _dio.post<Map<String, dynamic>>(
      path,
      // Keep the exact same UTF-8 JSON string for verification and mutation.
      data: body,
      cancelToken: cancellation,
      options: Options(
        followRedirects: false,
        maxRedirects: 0,
        validateStatus: _successfulStatus,
        contentType: Headers.jsonContentType,
        headers: {
          ...headers,
          'Idempotency-Key': key,
          if (proof != null) 'X-Lythaus-Action-Verification': proof,
        },
        extra: {
          IdempotencyRetryInterceptor.disableAutomaticRetryExtraKey: true,
        },
      ),
    );
    // A late account transition discards the response. It cannot trigger retry.
    if (_sessionCancellation.isCancelled || !_isCurrent()) {
      throw cancellation.cancelError ?? StateError('Session changed');
    }
    return response;
  }
}

bool _successfulStatus(int? status) =>
    status != null && status >= 200 && status < 300;

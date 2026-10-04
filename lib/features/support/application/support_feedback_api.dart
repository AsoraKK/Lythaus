// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

abstract interface class SupportFeedbackClient {
  bool get isCurrentSession;
  void cancelPending();
  Future<Map<String, dynamic>> getOptions();
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  });
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  });
  Future<Map<String, dynamic>> submit({
    required String kind,
    required Map<String, dynamic> body,
    required String idempotencyKey,
  });
  Future<Map<String, dynamic>> reply({
    required String kind,
    required String requestId,
    required int expectedRevision,
    required String message,
    required String idempotencyKey,
  });
}

class SupportFeedbackApiException implements Exception {
  const SupportFeedbackApiException(this.statusCode, this.code);

  final int? statusCode;
  final String code;
}

class SupportFeedbackCancelled implements Exception {
  const SupportFeedbackCancelled();
}

class DioSupportFeedbackClient implements SupportFeedbackClient {
  DioSupportFeedbackClient({
    required Dio dio,
    required Future<String?> Function() accessToken,
    required bool Function() isCurrentSession,
  }) : _dio = dio,
       _accessToken = accessToken,
       _isCurrentSession = isCurrentSession;

  final Dio _dio;
  final Future<String?> Function() _accessToken;
  final bool Function() _isCurrentSession;
  final Set<CancelToken> _pending = <CancelToken>{};
  static const Uuid _uuid = Uuid();

  @override
  bool get isCurrentSession => _isCurrentSession();

  @override
  void cancelPending() {
    for (final token in _pending.toList()) {
      token.cancel('support_feedback_cancelled');
    }
  }

  @override
  Future<Map<String, dynamic>> getOptions() => _request('/api/support/options');

  @override
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  }) => _request(
    '/api/support/${_pathKind(kind)}',
    query: <String, dynamic>{
      'limit': limit,
      if (cursor != null) 'cursor': cursor,
    },
  );

  @override
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  }) => _request(
    '/api/support/${_pathKind(kind)}/${Uri.encodeComponent(requestId)}',
    query: <String, dynamic>{
      if (messageBefore != null) 'messageBefore': messageBefore,
    },
  );

  @override
  Future<Map<String, dynamic>> submit({
    required String kind,
    required Map<String, dynamic> body,
    required String idempotencyKey,
  }) => _request(
    '/api/support/${_pathKind(kind)}',
    method: 'POST',
    body: <String, dynamic>{...body, 'kind': kind},
    idempotencyKey: idempotencyKey,
  );

  @override
  Future<Map<String, dynamic>> reply({
    required String kind,
    required String requestId,
    required int expectedRevision,
    required String message,
    required String idempotencyKey,
  }) => _request(
    '/api/support/${_pathKind(kind)}/${Uri.encodeComponent(requestId)}/messages',
    method: 'POST',
    body: <String, dynamic>{
      'expectedRevision': expectedRevision,
      'message': message,
    },
    idempotencyKey: idempotencyKey,
  );

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? query,
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final token = await _accessToken();
    if (!_isCurrentSession() || token == null || token.isEmpty) {
      throw const SupportFeedbackApiException(401, 'support_authentication_required');
    }
    final cancelToken = CancelToken();
    _pending.add(cancelToken);
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          headers: <String, String>{
            'Authorization': 'Bearer $token',
            'Cache-Control': 'no-store',
            if (body != null) 'Idempotency-Key': idempotencyKey ?? _uuid.v4(),
          },
        ),
        cancelToken: cancelToken,
      );
      if (!_isCurrentSession()) {
        throw const SupportFeedbackApiException(401, 'support_authentication_required');
      }
      final value = response.data;
      if (value is! Map) {
        throw const SupportFeedbackApiException(503, 'support_unavailable');
      }
      return Map<String, dynamic>.from(value);
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) throw const SupportFeedbackCancelled();
      final data = error.response?.data;
      final code = data is Map && data['error'] is String
          ? data['error'] as String
          : 'support_unavailable';
      throw SupportFeedbackApiException(error.response?.statusCode, code);
    } finally {
      _pending.remove(cancelToken);
    }
  }

  static String _pathKind(String kind) => switch (kind) {
    'problem' => 'problems',
    'suggestion' => 'suggestions',
    _ => throw ArgumentError.value(kind, 'kind'),
  };
}

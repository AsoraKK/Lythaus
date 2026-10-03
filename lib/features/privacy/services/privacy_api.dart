// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';

import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/network/api_endpoints.dart';
import 'package:lythaus/core/network/dio_client.dart';

/// Normalized error categories returned by the privacy API client.
enum PrivacyErrorType { unauthorized, rateLimited, network, server }

enum PrivacyRequestState {
  idle,
  received,
  processing,
  blocked,
  completed,
  failed,
  unknown,
}

PrivacyRequestState privacyRequestState(String value) => switch (value) {
  'idle' => PrivacyRequestState.idle,
  'received' || 'accepted' => PrivacyRequestState.received,
  'processing' || 'queued' => PrivacyRequestState.processing,
  'blocked' => PrivacyRequestState.blocked,
  'completed' => PrivacyRequestState.completed,
  'failed' => PrivacyRequestState.failed,
  _ => PrivacyRequestState.unknown,
};

/// Exception thrown when a privacy API request fails.
class PrivacyApiException implements Exception {
  const PrivacyApiException(
    this.type, {
    this.message = 'privacy_api_error',
    this.retryAfter,
    this.statusCode,
  });

  final PrivacyErrorType type;
  final String message;
  final Duration? retryAfter;
  final int? statusCode;
}

/// Successful export request payload.
class ExportRequestResult {
  const ExportRequestResult({
    required this.requestId,
    required this.acceptedAt,
    this.retryAfter,
  });

  final String requestId;
  final DateTime acceptedAt;
  final Duration? retryAfter;
}

/// Export status DTO returned by the API.
class ExportStatusDTO {
  const ExportStatusDTO({
    required this.state,
    this.acceptedAt,
    this.retryAfterSeconds,
    this.requestId,
    this.completedAt,
    this.canRequest = false,
  });

  final String state;
  final DateTime? acceptedAt;
  final int? retryAfterSeconds;
  final String? requestId;
  final DateTime? completedAt;
  final bool canRequest;
  PrivacyRequestState get requestState => privacyRequestState(state);
}

/// Abstraction for export/delete privacy APIs.
abstract class PrivacyApi {
  Future<ExportRequestResult> requestExport({required String authToken});
  Future<ExportStatusDTO> getExportStatus({required String authToken});
  Future<ExportStatusDTO> getDeleteStatus({required String authToken});
  Future<ExportStatusDTO> deleteAccount({required String authToken});
  Future<Uint8List> downloadExport({
    required String authToken,
    required String requestId,
  });
}

/// Dio-backed implementation of [PrivacyApi].
class DioPrivacyApi implements PrivacyApi {
  DioPrivacyApi({
    required Dio dio,
    required AppLogger logger,
    DateTime Function()? clock,
    CancelToken? cancelToken,
  }) : _dio = dio,
       _logger = logger,
       _cancelToken = cancelToken,
       _now = clock ?? DateTime.now;

  final Dio _dio;
  final AppLogger _logger;
  final DateTime Function() _now;
  final CancelToken? _cancelToken;
  static const Uuid _uuid = Uuid();

  @override
  Future<ExportRequestResult> requestExport({required String authToken}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.exportUser,
        data: const {'requestType': 'export'},
        options: Options(headers: _headers(authToken)),
        cancelToken: _cancelToken,
      );

      final data = response.data ?? const <String, dynamic>{};
      final requestId = data['requestId'];
      if (requestId is! String || requestId.isEmpty) {
        throw const PrivacyApiException(
          PrivacyErrorType.server,
          message: 'privacy_request_id_missing',
        );
      }
      final acceptedAt = _parseAcceptedAt(data);
      if (acceptedAt == null) {
        throw const PrivacyApiException(PrivacyErrorType.server);
      }
      final retryAfter = _retryAfterFromResponse(response);

      return ExportRequestResult(
        requestId: requestId,
        acceptedAt: acceptedAt,
        retryAfter: retryAfter,
      );
    } on DioException catch (error, stackTrace) {
      _logger.error('privacy_export_request_failed', error, stackTrace);
      throw _mapException(error);
    }
  }

  @override
  Future<ExportStatusDTO> getExportStatus({required String authToken}) =>
      _getStatus(authToken, 'export');

  @override
  Future<ExportStatusDTO> getDeleteStatus({required String authToken}) =>
      _getStatus(authToken, 'delete');

  Future<ExportStatusDTO> _getStatus(String authToken, String type) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '${ApiEndpoints.privacyRequests}?requestType=$type',
        options: Options(headers: _headers(authToken, mutation: false)),
        cancelToken: _cancelToken,
      );

      final data = response.data ?? const <String, dynamic>{};
      if (data.containsKey('request') && data['request'] == null) {
        return const ExportStatusDTO(state: 'idle', canRequest: true);
      }
      final request = data['request'] is Map<String, dynamic>
          ? data['request'] as Map<String, dynamic>
          : data;
      if (request['requestType'] != null && request['requestType'] != type) {
        throw const PrivacyApiException(PrivacyErrorType.server);
      }
      final status = _parseRequest(request);
      final rawRetryAfter =
          data['retryAfterSeconds'] ?? request['retryAfterSeconds'];
      if (rawRetryAfter != null &&
          (rawRetryAfter is! int || rawRetryAfter < 0)) {
        throw const PrivacyApiException(
          PrivacyErrorType.server,
          message: 'privacy_cooldown_invalid',
        );
      }
      final retryAfter = rawRetryAfter as int?;
      final terminal =
          status.requestState == PrivacyRequestState.completed ||
          status.requestState == PrivacyRequestState.failed;
      return ExportStatusDTO(
        state: status.state,
        acceptedAt: status.acceptedAt,
        requestId: status.requestId,
        completedAt: status.completedAt,
        retryAfterSeconds: retryAfter,
        canRequest: terminal && (type == 'delete' || retryAfter == 0),
      );
    } on DioException catch (error) {
      _logger.warning('privacy_status_failed');
      throw _mapException(error);
    }
  }

  @override
  Future<ExportStatusDTO> deleteAccount({required String authToken}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.deleteUser,
        data: const {'requestType': 'delete'},
        options: Options(headers: _headers(authToken)),
        cancelToken: _cancelToken,
      );
      return _parseRequest(response.data ?? const {});
    } on DioException catch (error, stackTrace) {
      _logger.error('privacy_delete_request_failed', error, stackTrace);
      throw _mapException(error);
    }
  }

  @override
  Future<Uint8List> downloadExport({
    required String authToken,
    required String requestId,
  }) async {
    try {
      final response = await _dio.get<List<int>>(
        '${ApiEndpoints.privacyRequests}/${Uri.encodeComponent(requestId)}/export',
        options: Options(
          headers: _headers(authToken, mutation: false),
          responseType: ResponseType.bytes,
        ),
        cancelToken: _cancelToken,
      );
      final bytes = response.data;
      final hash = response.headers.value('x-content-sha256');
      if (bytes == null ||
          bytes.isEmpty ||
          hash == null ||
          sha256.convert(bytes).toString() != hash.toLowerCase()) {
        throw const PrivacyApiException(
          PrivacyErrorType.server,
          message: 'export_unavailable',
        );
      }
      return Uint8List.fromList(bytes);
    } on DioException catch (error) {
      throw _mapException(error);
    }
  }

  ExportStatusDTO _parseRequest(Map<String, dynamic> data) {
    final id = data['requestId'];
    final acceptedAt = _parseAcceptedAt(data);
    if (id is! String ||
        id.isEmpty ||
        acceptedAt == null ||
        data['state'] is! String) {
      throw const PrivacyApiException(
        PrivacyErrorType.server,
        message: 'privacy_request_invalid',
      );
    }
    return ExportStatusDTO(
      state: (data['state'] as String).toLowerCase(),
      requestId: id,
      acceptedAt: acceptedAt,
      completedAt: data['completedAt'] is String
          ? DateTime.tryParse(data['completedAt'] as String)?.toUtc()
          : null,
    );
  }

  Map<String, String> _headers(String token, {bool mutation = true}) {
    if (token.trim().isEmpty) {
      throw const PrivacyApiException(PrivacyErrorType.unauthorized);
    }
    return {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
      if (mutation) 'Idempotency-Key': 'privacy-${_uuid.v4()}',
    };
  }

  PrivacyApiException _mapException(DioException error) {
    final status = error.response?.statusCode;
    final retryAfter = _retryAfterFromResponse(error.response);

    switch (status) {
      case 401:
        return const PrivacyApiException(
          PrivacyErrorType.unauthorized,
          message: 'session_expired',
        );
      case 429:
        return PrivacyApiException(
          PrivacyErrorType.rateLimited,
          message: 'rate_limited',
          retryAfter: retryAfter,
          statusCode: status,
        );
      default:
        break;
    }

    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return const PrivacyApiException(
        PrivacyErrorType.network,
        message: 'network_error',
      );
    }

    return PrivacyApiException(
      PrivacyErrorType.server,
      message: 'server_error',
      statusCode: status,
    );
  }

  Duration? _retryAfterFromResponse(Response<dynamic>? response) {
    final header = response?.headers.value('retry-after');
    if (header == null) return null;

    final seconds = int.tryParse(header);
    if (seconds != null && seconds > 0) {
      return Duration(seconds: seconds);
    }

    final dateValue = DateTime.tryParse(header);
    if (dateValue != null) {
      final diff = dateValue.toUtc().difference(_now().toUtc());
      if (!diff.isNegative) {
        return diff;
      }
    }

    return null;
  }

  DateTime? _parseAcceptedAt(dynamic data) {
    if (data is Map<String, dynamic>) {
      final acceptedAt = data['acceptedAt'];
      if (acceptedAt is String) {
        return DateTime.tryParse(acceptedAt)?.toUtc();
      }
    }
    return null;
  }
}

final privacyApiProvider = Provider<PrivacyApi>((ref) {
  ref.watch(authSessionRevisionProvider);
  final session = ref.read(authSessionRevisionProvider.notifier);
  ref.watch(currentUserProvider.select((user) => user?.id));
  final cancellation = CancelToken();
  final stop = session.cancelOnChange(
    () => cancellation.cancel('privacy_session_changed'),
  );
  ref.onDispose(stop);
  ref.onDispose(() => cancellation.cancel('privacy_session_changed'));
  final dio = ref.watch(secureDioProvider);
  final logger = ref.watch(appLoggerProvider);
  return DioPrivacyApi(dio: dio, logger: logger, cancelToken: cancellation);
});

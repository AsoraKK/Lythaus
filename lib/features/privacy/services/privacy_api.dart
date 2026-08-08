// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/network/api_endpoints.dart';
import 'package:lythaus/core/network/dio_client.dart';

/// Normalized error categories returned by the privacy API client.
enum PrivacyErrorType { unauthorized, rateLimited, network, server }

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
  });

  final String state;
  final DateTime? acceptedAt;
  final int? retryAfterSeconds;
}

/// Abstraction for export/delete privacy APIs.
abstract class PrivacyApi {
  Future<ExportRequestResult> requestExport({required String authToken});
  Future<ExportStatusDTO> getExportStatus({required String authToken});
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  });
}

/// Dio-backed implementation of [PrivacyApi].
class DioPrivacyApi implements PrivacyApi {
  DioPrivacyApi({
    required Dio dio,
    required AppLogger logger,
    DateTime Function()? clock,
  }) : _dio = dio,
       _logger = logger,
       _now = clock ?? DateTime.now;

  final Dio _dio;
  final AppLogger _logger;
  final DateTime Function() _now;
  static const Uuid _uuid = Uuid();

  @override
  Future<ExportRequestResult> requestExport({required String authToken}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.exportUser,
        data: const {'requestType': 'export'},
        options: Options(headers: _headers(authToken)),
      );

      final data = response.data ?? const <String, dynamic>{};
      final requestId = data['requestId'] as String?;
      if (requestId == null || requestId.isEmpty) {
        throw const PrivacyApiException(
          PrivacyErrorType.server,
          message: 'privacy_request_id_missing',
        );
      }
      final acceptedAt = _parseAcceptedAt(data) ?? _now().toUtc();
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
  Future<ExportStatusDTO> getExportStatus({required String authToken}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        ApiEndpoints.exportStatus,
        options: Options(headers: _headers(authToken)),
      );

      final data = response.data ?? const <String, dynamic>{};
      final request = data['request'] is Map<String, dynamic>
          ? data['request'] as Map<String, dynamic>
          : data;
      return ExportStatusDTO(
        state: (request['state'] as String?)?.toLowerCase() ?? 'idle',
        acceptedAt: _parseAcceptedAt(request),
        retryAfterSeconds: request['retryAfterSeconds'] as int?,
      );
    } on DioException catch (error, stackTrace) {
      // Treat 404 as "status endpoint not available" rather than fatal.
      if (error.response?.statusCode == 404) {
        _logger.warning('privacy_export_status_endpoint_missing');
        return const ExportStatusDTO(state: 'idle');
      }
      _logger.error('privacy_export_status_failed', error, stackTrace);
      throw _mapException(error);
    }
  }

  @override
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.deleteUser,
        data: const {'requestType': 'delete'},
        options: Options(headers: _headers(authToken)),
      );
    } on DioException catch (error, stackTrace) {
      _logger.error('privacy_delete_request_failed', error, stackTrace);
      throw _mapException(error);
    }
  }

  Map<String, String> _headers(String token) => {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
    'Idempotency-Key': 'privacy-${_uuid.v4()}',
  };

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
      final acceptedAt = data['acceptedAt'] as String?;
      if (acceptedAt != null) {
        return DateTime.tryParse(acceptedAt)?.toUtc();
      }
    }
    return null;
  }
}

final privacyApiProvider = Provider<PrivacyApi>((ref) {
  final dio = ref.watch(secureDioProvider);
  final logger = ref.watch(appLoggerProvider);
  return DioPrivacyApi(dio: dio, logger: logger);
});

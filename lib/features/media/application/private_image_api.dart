// ignore_for_file: public_member_api_docs

import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:uuid/uuid.dart';

const privateImageMaxBytes = 10 * 1024 * 1024;
final _sessionId = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

enum PrivateImageStage { create, bytes, finalise, status }

class PrivateImageAttempt {
  PrivateImageAttempt(Uint8List bytes, this.contentType)
    : bytes = Uint8List.fromList(bytes),
      checksum = sha256.convert(bytes).toString();

  final Uint8List bytes;
  final String contentType;
  final String checksum;
  final String createKey = const Uuid().v4();
  final String finaliseKey = const Uuid().v4();
  String? sessionId;
  PrivateImageStage stage = PrivateImageStage.create;
}

class PrivateImageStatus {
  const PrivateImageStatus(this.status, this.processingComplete);

  final String status;
  final bool processingComplete;
  bool get isPending => status == 'pending' || status == 'queued';

  factory PrivateImageStatus.parse(Map<String, dynamic> data, String id) {
    final status = data['status'];
    const supported = {
      'pending',
      'queued',
      'review',
      'rejected',
      'expired',
      'cancelled',
    };
    if (data['uploadSessionId'] != id ||
        !supported.contains(status) ||
        data['private'] != true ||
        data['publication'] is! Map ||
        (data['publication'] as Map)['allowed'] != false ||
        data['safety'] is! Map ||
        (data['safety'] as Map)['status'] != 'not_run' ||
        data['authenticity'] is! Map ||
        (data['authenticity'] as Map)['status'] != 'not_run' ||
        data['processingComplete'] != (status == 'review') ||
        data['expiresAt'] is! String ||
        DateTime.tryParse(data['expiresAt'] as String) == null) {
      throw const FormatException('Private image status unavailable');
    }
    return PrivateImageStatus(status as String, status == 'review');
  }
}

class PrivateImageApi {
  PrivateImageApi(this._dio, this._token);

  final Dio _dio;
  final Future<String?> Function() _token;

  Future<Map<String, dynamic>> _request(
    String path, {
    required CancelToken cancel,
    required bool Function() isCurrent,
    String method = 'GET',
    Object? data,
    String? key,
    String? contentType,
    void Function(int, int)? progress,
  }) async {
    if (!isCurrent() || cancel.isCancelled) throw StateError('Session changed');
    final token = await _token();
    if (!isCurrent() || cancel.isCancelled) throw StateError('Session changed');
    if (token == null || token.isEmpty) throw StateError('Sign in required');
    final result = await _dio.request<Map<String, dynamic>>(
      path,
      data: data,
      cancelToken: cancel,
      onSendProgress: progress,
      options: Options(
        method: method,
        contentType: contentType,
        followRedirects: false,
        maxRedirects: 0,
        extra: {
          IdempotencyRetryInterceptor.disableAutomaticRetryExtraKey: true,
        },
        headers: {
          'Authorization': 'Bearer $token',
          if (key != null) 'Idempotency-Key': key,
        },
      ),
    );
    if (!isCurrent() || cancel.isCancelled) throw StateError('Session changed');
    return result.data ?? (throw const FormatException('Empty media response'));
  }

  Future<PrivateImageStatus> resume(
    PrivateImageAttempt attempt, {
    required CancelToken cancel,
    required bool Function() isCurrent,
    void Function(int, int)? progress,
  }) async {
    if (attempt.bytes.isEmpty ||
        attempt.bytes.length > privateImageMaxBytes ||
        !{'image/png', 'image/jpeg'}.contains(attempt.contentType)) {
      throw const FormatException('Unsupported image');
    }
    if (attempt.stage == PrivateImageStage.create) {
      final created = await _request(
        '/api/media/uploads',
        method: 'POST',
        data: {
          'size': attempt.bytes.length,
          'contentType': attempt.contentType,
          'checksumSha256': attempt.checksum,
        },
        key: attempt.createKey,
        cancel: cancel,
        isCurrent: isCurrent,
      );
      final id = created['uploadSessionId'];
      if (id is! String ||
          !_sessionId.hasMatch(id) ||
          created['checksumSha256'] != attempt.checksum ||
          created['contentType'] != attempt.contentType) {
        throw const FormatException('Invalid upload session');
      }
      attempt.sessionId = id;
      attempt.stage = PrivateImageStage.bytes;
    }
    final id = attempt.sessionId!;
    if (attempt.stage == PrivateImageStage.bytes) {
      final uploaded = await _request(
        '/api/media/uploads/$id/bytes',
        method: 'PUT',
        data: Stream<List<int>>.value(attempt.bytes),
        contentType: attempt.contentType,
        progress: progress,
        cancel: cancel,
        isCurrent: isCurrent,
      );
      if (uploaded['uploadSessionId'] != id || uploaded['status'] != 'stored') {
        throw const FormatException('Invalid upload receipt');
      }
      attempt.stage = PrivateImageStage.finalise;
    }
    if (attempt.stage == PrivateImageStage.finalise) {
      final finalised = await _request(
        '/api/media/uploads/$id/finalise',
        method: 'POST',
        data: const <String, dynamic>{},
        key: attempt.finaliseKey,
        cancel: cancel,
        isCurrent: isCurrent,
      );
      if (finalised['uploadSessionId'] != id ||
          finalised['status'] != 'queued') {
        throw const FormatException('Invalid finalisation receipt');
      }
      attempt.stage = PrivateImageStage.status;
    }
    return status(id, cancel: cancel, isCurrent: isCurrent);
  }

  Future<PrivateImageStatus> status(
    String id, {
    required CancelToken cancel,
    required bool Function() isCurrent,
  }) async {
    if (!_sessionId.hasMatch(id)) {
      throw const FormatException('Invalid session');
    }
    return PrivateImageStatus.parse(
      await _request(
        '/api/media/uploads/$id',
        cancel: cancel,
        isCurrent: isCurrent,
      ),
      id,
    );
  }
}

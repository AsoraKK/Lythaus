// ignore_for_file: public_member_api_docs

import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

const privateAlphaConsentVersion = 'lythaus-authenticity-private-alpha-v0.1.0';

final privateAlphaApiProvider = Provider<PrivateAlphaApi>((ref) {
  final secure = ref.watch(secureDioProvider);
  final dio = Dio(secure.options.copyWith());
  dio.httpClientAdapter = secure.httpClientAdapter;
  dio.interceptors.addAll(
    secure.interceptors.where(
      (item) => item is! LogInterceptor && item is! IdempotencyRetryInterceptor,
    ),
  );
  dio.interceptors.add(IdempotencyRetryInterceptor(dio));
  return PrivateAlphaApi(dio, () => ref.read(jwtProvider.future));
});

class PrivateAlphaApi {
  PrivateAlphaApi(this._dio, this._token, {Dio Function()? uploadClient})
      : _uploadClient = uploadClient ?? _newUploadClient;

  final Dio _dio;
  final Future<String?> Function() _token;
  final Dio Function() _uploadClient;

  static Dio _newUploadClient() => Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(minutes: 2),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

  Future<Map<String, dynamic>> request(
    String suffix, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    final token = await _token();
    if (token == null) {
      throw StateError('Sign in to access the private alpha.');
    }
    final url = Uri.parse(_dio.options.baseUrl).replace(
      path: '/api/authenticity/alpha/cases$suffix',
      query: null,
      fragment: null,
    );
    final response = await _dio.request<Map<String, dynamic>>(
      url.toString(),
      data: data,
      options: Options(
        method: method,
        headers: {
          'Authorization': 'Bearer $token',
          if (method != 'GET') 'Idempotency-Key': const Uuid().v4(),
        },
      ),
    );
    return response.data ?? <String, dynamic>{};
  }

  Future<String> submitText({
    required String text,
    required bool observerRequested,
    required bool explanationRequested,
  }) async {
    final created = await request(
      '',
      method: 'POST',
      data: {
        'contentKind': 'text',
        'text': text,
        'observerRequested': observerRequested,
        'explanationRequested': explanationRequested,
        'consentVersion': privateAlphaConsentVersion,
        'trainingConsent': false,
      },
    );
    return created['caseId'] as String;
  }

  Future<String> uploadImage({
    required Uint8List bytes,
    required String mime,
    required String? text,
    required bool observerRequested,
    required bool explanationRequested,
    required void Function(int, int) progress,
  }) async {
    if (bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
      throw StateError('Choose an image no larger than 10 MiB.');
    }
    final created = await request(
      '',
      method: 'POST',
      data: {
        'contentKind': text == null ? 'image' : 'text_image',
        if (text != null) 'text': text,
        'contentType': mime,
        'size': bytes.length,
        'checksumSha256': sha256.convert(bytes).toString(),
        'observerRequested': observerRequested,
        'explanationRequested': explanationRequested,
        'consentVersion': privateAlphaConsentVersion,
        'trainingConsent': false,
      },
    );
    final caseId = created['caseId'] as String;
    final target = Uri.parse(created['uploadUrl'] as String);
    if (target.scheme != 'https' ||
        !target.host.endsWith('.r2.cloudflarestorage.com')) {
      throw StateError('Upload destination unavailable.');
    }
    final uploadDio = _uploadClient();
    try {
      await uploadDio.put<void>(
        target.toString(),
        data: Stream<List<int>>.value(bytes),
        options: Options(
          contentType: mime,
          followRedirects: false,
          maxRedirects: 0,
          headers: {'Content-Length': bytes.length},
        ),
        onSendProgress: progress,
      );
    } finally {
      uploadDio.close();
    }
    await request('/$caseId/finalise', method: 'POST', data: const {});
    return caseId;
  }

  Future<Uint8List?> image(String caseId) async {
    final token = await _token();
    if (token == null) return null;
    final url = Uri.parse(_dio.options.baseUrl).replace(
      path: '/api/authenticity/alpha/cases/$caseId/image',
      query: null,
      fragment: null,
    );
    final response = await _dio.get<List<int>>(
      url.toString(),
      options: Options(
        responseType: ResponseType.bytes,
        headers: {'Authorization': 'Bearer $token'},
      ),
    );
    final bytes = response.data;
    if (bytes == null || bytes.length > 10 * 1024 * 1024) return null;
    return Uint8List.fromList(bytes);
  }
}

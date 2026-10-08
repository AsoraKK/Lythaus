import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/authenticity/alpha_api.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions, Stream<Uint8List>?)
  respond;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) => respond(options, stream);
}

void main() {
  test(
    'text alpha submission is authenticated and keeps authorship unavailable',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/api'));
      dio.httpClientAdapter = _Adapter((options, _) async {
        expect(options.uri.path, '/api/authenticity/alpha/cases');
        expect(options.method, 'POST');
        expect(options.headers['Authorization'], 'Bearer alpha-token');
        expect(options.headers['Idempotency-Key'], isNotEmpty);
        expect(options.data['contentKind'], 'text');
        expect(options.data['trainingConsent'], false);
        return ResponseBody.fromString(
          jsonEncode({'caseId': 'alpha-1', 'status': 'queued'}),
          201,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final api = PrivateAlphaApi(dio, () async => 'alpha-token');
      expect(
        await api.submitText(
          text: 'caption',
          observerRequested: false,
          explanationRequested: true,
        ),
        'alpha-1',
      );
    },
  );

  test(
    'image upload sends exact bytes without credentials and finalises once',
    () async {
      final bytes = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
      final paths = <String>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/api'));
      dio.httpClientAdapter = _Adapter((options, _) async {
        paths.add(options.uri.path);
        expect(options.headers['Authorization'], 'Bearer alpha-token');
        if (options.uri.path.endsWith('/cases')) {
          expect(
            options.data['checksumSha256'],
            sha256.convert(bytes).toString(),
          );
          expect(options.data['contentKind'], 'image');
          return ResponseBody.fromString(
            jsonEncode({
              'caseId': 'alpha-2',
              'uploadUrl':
                  'https://account.r2.cloudflarestorage.com/private/object?sig=test',
            }),
            201,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          );
        }
        return ResponseBody.fromString(
          '{"status":"queued"}',
          202,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final upload = Dio();
      upload.httpClientAdapter = _Adapter((options, stream) async {
        expect(
          options.headers.keys.any(
            (key) => key.toLowerCase() == 'authorization',
          ),
          false,
        );
        expect(options.followRedirects, false);
        expect(options.contentType, 'image/png');
        final sent = await stream!.fold<List<int>>(
          [],
          (all, chunk) => all..addAll(chunk),
        );
        expect(sent, bytes);
        return ResponseBody.fromString('', 200);
      });

      final api = PrivateAlphaApi(
        dio,
        () async => 'alpha-token',
        uploadClient: () => upload,
      );
      expect(
        await api.uploadImage(
          bytes: bytes,
          mime: 'image/png',
          text: null,
          observerRequested: true,
          explanationRequested: false,
          progress: (_, __) {},
        ),
        'alpha-2',
      );
      expect(paths, [
        '/api/authenticity/alpha/cases',
        '/api/authenticity/alpha/cases/alpha-2/finalise',
      ]);
    },
  );

  test(
    'untrusted upload destinations are rejected before bytes leave the app',
    () async {
      for (final target in [
        'http://account.r2.cloudflarestorage.com/object',
        'https://account.r2.cloudflarestorage.com.evil.test/object',
        'https://127.0.0.1/object',
      ]) {
        final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/api'));
        dio.httpClientAdapter = _Adapter((options, _) async {
          return ResponseBody.fromString(
            jsonEncode({'caseId': 'alpha-3', 'uploadUrl': target}),
            201,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          );
        });
        final api = PrivateAlphaApi(
          dio,
          () async => 'alpha-token',
          uploadClient: () => throw StateError('upload must not start'),
        );
        await expectLater(
          api.uploadImage(
            bytes: Uint8List.fromList([1]),
            mime: 'image/png',
            text: null,
            observerRequested: false,
            explanationRequested: false,
            progress: (_, __) {},
          ),
          throwsStateError,
        );
      }
    },
  );
}

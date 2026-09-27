import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/authenticity/beta_api.dart';

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
    'uploads exact selected bytes without credentials, then finalises once',
    () async {
      final input = Uint8List.fromList([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        1,
        2,
        3,
      ]);
      final calls = <String>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/api'));
      dio.httpClientAdapter = _Adapter((options, stream) async {
        calls.add(options.uri.path);
        expect(options.headers['Authorization'], 'Bearer test-token');
        expect(options.headers['Idempotency-Key'], isNotEmpty);
        if (options.uri.path.endsWith('/cases')) {
          expect(
            options.data['checksumSha256'],
            sha256.convert(input).toString(),
          );
          expect(options.data['trainingConsent'], false);
          expect(options.data.containsKey('filename'), false);
          return ResponseBody.fromString(
            jsonEncode({
              'caseId': 'case-1',
              'uploadUrl':
                  'https://account.r2.cloudflarestorage.com/private/object?signature=test',
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
        final bytes = await stream!.fold<List<int>>(
          [],
          (all, chunk) => all..addAll(chunk),
        );
        expect(bytes, input);
        expect(options.contentType, 'image/png');
        return ResponseBody.fromString('', 200);
      });
      final api = BetaApi(
        dio,
        () async => 'test-token',
        uploadClient: () => upload,
      );
      expect(await api.upload(input, 'image/png', (_, __) {}), 'case-1');
      expect(calls, [
        '/api/authenticity/cases',
        '/api/authenticity/cases/case-1/finalise',
      ]);
    },
  );
  test(
    'unauthenticated and oversized submissions do not create a case',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test'));
      var calls = 0;
      dio.httpClientAdapter = _Adapter((_, __) async {
        calls++;
        return ResponseBody.fromString('{}', 200);
      });
      final api = BetaApi(dio, () async => null);
      await expectLater(api.request(''), throwsStateError);
      await expectLater(
        api.upload(Uint8List(10485761), 'image/png', (_, __) {}),
        throwsStateError,
      );
      expect(calls, 0);
    },
  );
}

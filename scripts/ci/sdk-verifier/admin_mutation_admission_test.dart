import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

const targetId = '01900000-0000-7000-8000-000000000010';
const adminOrigin = 'https://admin.lythaus.co';

class GuardAdapter implements HttpClientAdapter {
  final requests = <Map<String, Object?>>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final bytes = requestStream == null
        ? null
        : await requestStream.expand((chunk) => chunk).toList();
    final capture = <String, Object?>{
      'url': options.uri.toString(),
      'method': options.method,
      'headers': options.headers.map(
        (name, value) => MapEntry(name.toLowerCase(), value),
      ),
      'body': bytes == null ? null : utf8.decode(bytes),
    };
    requests.add(capture);
    final harness = Platform.environment['LYTHAUS_ADMIN_MUTATION_GUARD'];
    if (harness == null) throw StateError('guard harness is required');
    final process = await Process.start('node', [
      '--experimental-strip-types',
      harness,
    ]);
    final output = process.stdout.transform(utf8.decoder).join();
    final errors = process.stderr.transform(utf8.decoder).join();
    process.stdin.write(jsonEncode(capture));
    await process.stdin.close();
    final exitCode = await process.exitCode;
    if (exitCode != 0) throw StateError(await errors);
    final admission = jsonDecode(await output) as Map<String, dynamic>;
    final status = admission['status'] as int;
    final body = status != 200
        ? {'error': admission['error'], 'correlationId': 'synthetic-sdk'}
        : options.path.endsWith('/tier')
        ? {'userId': targetId, 'tier': 'premium', 'changed': true}
        : {'id': targetId, 'active': false};
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late LythausApiClient client;
  late GuardAdapter adapter;
  setUp(() {
    adapter = GuardAdapter();
    client = LythausApiClient(basePathOverride: '$adminOrigin/api');
    client.dio.httpClientAdapter = adapter;
  });
  tearDown(() => client.dio.close());

  test(
    'default generated clear call is bodyless and passes the real guard',
    () async {
      final response = await client.getAdminApi().adminLegalHoldsClear(
        holdId: targetId,
      );
      expect(response.statusCode, 200);
      expect(response.data?.active, isFalse);
      expect(adapter.requests.single, {
        'url': '$adminOrigin/api/admin/privacy/legal-holds/$targetId/clear',
        'method': 'POST',
        'headers': {
          'origin': adminOrigin,
          'content-type': Headers.jsonContentType,
        },
        'body': null,
      });
    },
  );

  test(
    'approved explicit Origin still receives JSON media with no body',
    () async {
      final response = await client.getAdminApi().adminLegalHoldsClear(
        holdId: targetId,
        headers: {'Origin': adminOrigin},
      );
      expect(response.statusCode, 200);
      expect(adapter.requests.single['body'], isNull);
      expect(
        (adapter.requests.single['headers'] as Map)['content-type'],
        Headers.jsonContentType,
      );
    },
  );

  test('generated caller cannot override origin past the real guard', () async {
    await expectLater(
      client.getAdminApi().adminLegalHoldsClear(
        holdId: targetId,
        headers: {'Origin': 'https://untrusted.invalid'},
      ),
      throwsA(
        isA<DioException>().having(
          (error) => error.response?.statusCode,
          'status',
          403,
        ),
      ),
    );
  });

  test('secondary-host configuration is rejected by the real guard', () async {
    client.dio.options.baseUrl = 'https://admin-api.lythaus.co/api';
    await expectLater(
      client.getAdminApi().adminLegalHoldsClear(holdId: targetId),
      throwsA(
        isA<DioException>().having(
          (error) => error.response?.statusCode,
          'status',
          403,
        ),
      ),
    );
  });

  for (final mediaType in [null, 'text/plain']) {
    test(
      'missing or plain-text media stays rejected by the real guard: $mediaType',
      () async {
        client.dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              options.contentType = mediaType;
              handler.next(options);
            },
          ),
        );
        await expectLater(
          client.getAdminApi().adminLegalHoldsClear(holdId: targetId),
          throwsA(
            isA<DioException>().having(
              (error) => error.response?.statusCode,
              'status',
              415,
            ),
          ),
        );
      },
    );
  }

  test(
    'normal generated JSON mutation retains its serialized body and admission',
    () async {
      final request = standardSerializers.deserializeWith(
        AccountTierUpdate.serializer,
        {'tier': 'premium', 'reasonCode': 'SYNTHETIC_TEST'},
      )!;
      final response = await client.getAdminApi().adminUsersTierUpdate(
        userId: targetId,
        accountTierUpdate: request,
      );
      expect(response.statusCode, 200);
      expect(jsonDecode(adapter.requests.single['body'] as String), {
        'tier': 'premium',
        'reasonCode': 'SYNTHETIC_TEST',
      });
      expect(
        (adapter.requests.single['headers'] as Map)['origin'],
        adminOrigin,
      );
    },
  );
}

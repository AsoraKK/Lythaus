import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';

final _proof = '019b2222-2222-7222-8222-222222222222.${'a' * 64}';
ResponseBody _response(int status, Map<String, dynamic> data) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
ResponseBody _challenge() =>
    _response(403, {'error': 'recent_authentication_required'});

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handle);
  final FutureOr<ResponseBody> Function(RequestOptions) handle;
  final requests = <RequestOptions>[];
  final bytes = <String>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    bytes.add(
      requestStream == null
          ? ''
          : utf8.decode(await requestStream.expand((chunk) => chunk).toList()),
    );
    return handle(options);
  }

  @override
  void close({bool force = false}) {}
}

class _Harness {
  _Harness(FutureOr<ResponseBody> Function(RequestOptions) handle) {
    adapter = _Adapter(handle);
    dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid/api'))
      ..httpClientAdapter = adapter;
    dio.interceptors.add(CanonicalApiPathInterceptor());
    dio.interceptors.add(IdempotencyRetryInterceptor(dio));
    client = RecentAccountActionClient(
      dio: dio,
      sessionHeaders: () async => headers,
      isCurrent: () => current,
      sessionCancellation: cancellation,
    );
  }
  late final _Adapter adapter;
  late final Dio dio;
  late final RecentAccountActionClient client;
  final cancellation = CancelToken();
  bool current = true;
  Map<String, String>? headers = {
    'Authorization': 'Bearer existing-access',
    'X-Lythaus-Session-Binding': 'existing-refresh',
  };
  String key = 'original-operation-key';
  int prompts = 0;
  Future<Response<Map<String, dynamic>>> run({
    AccountPasswordPrompt? prompt,
    String path = '/api/rewards/example/redeem',
    String body = '',
  }) => client.post(
    path: path,
    body: body,
    idempotencyKey: key,
    onRetryKey: (value) => key = value,
    passwordPrompt:
        prompt ??
        (verify, _) async {
          prompts++;
          return verify('existing password');
        },
  );
}

void main() {
  for (final deletion in [false, true]) {
    test(
      'actual encoded ${deletion ? 'deletion' : 'reward'} challenge/password/new-key retry binds exact operation',
      () async {
        var mutations = 0;
        final action = deletion ? 'account_delete' : 'reward_claim';
        final body = deletion ? '{"requestType":"delete"}' : '';
        final path = deletion
            ? '/api/privacy/requests'
            : '/api/rewards/example/redeem';
        final h = _Harness((request) {
          if (request.uri.path == '/api/auth/recent-verification') {
            final data = request.data as Map;
            expect(data['password'], 'existing password');
            expect(data['operation'], {
              'method': 'POST',
              'path': path,
              'body': body,
            });
            expect(data.keys, unorderedEquals(['password', 'operation']));
            return _response(201, {'proof': _proof, 'action': action});
          }
          mutations++;
          if (mutations == 1) return _challenge();
          expect(request.headers['X-Lythaus-Action-Verification'], _proof);
          return _response(201, {'state': 'received'});
        });
        expect((await h.run(path: path, body: body)).statusCode, 201);
        final requests = h.adapter.requests;
        expect(requests.map((r) => r.uri.path), [
          path,
          '/api/auth/recent-verification',
          path,
        ]);
        expect(
          requests[0].headers['Idempotency-Key'],
          'original-operation-key',
        );
        expect(requests[2].headers['Idempotency-Key'], h.key);
        expect(h.key, isNot('original-operation-key'));
        expect(h.adapter.bytes[0], body);
        expect(h.adapter.bytes[2], body);
        expect(
          requests.every(
            (r) => r.headers['Authorization'] == 'Bearer existing-access',
          ),
          isTrue,
        );
        expect(
          requests.every(
            (r) => r.headers['X-Lythaus-Session-Binding'] == 'existing-refresh',
          ),
          isTrue,
        );
        expect(
          requests[0].headers.containsKey('X-Lythaus-Action-Verification'),
          isFalse,
        );
        expect(requests[1].headers.containsKey('Idempotency-Key'), isFalse);
        expect(h.prompts, 1);
      },
    );
  }

  for (final status in [401, 403, 409, 500]) {
    test(
      'status $status without the exact challenge never prompts or changes keys',
      () async {
        final h = _Harness((_) => _response(status, {'error': 'other_error'}));
        await expectLater(h.run(), throwsA(isA<DioException>()));
        expect(h.prompts, 0);
        expect(h.key, 'original-operation-key');
        expect(h.adapter.requests, hasLength(1));
      },
    );
  }

  test(
    'offline unknown outcome never prompts or retries, and reuses the same key on reconciliation',
    () async {
      var offline = true;
      final h = _Harness((r) {
        if (offline) {
          throw DioException(
            requestOptions: r,
            type: DioExceptionType.connectionError,
          );
        }
        return _response(201, {'state': 'received'});
      });
      await expectLater(h.run(), throwsA(isA<DioException>()));
      expect(h.adapter.requests, hasLength(1));
      expect(h.prompts, 0);
      offline = false;
      await h.run();
      expect(
        h.adapter.requests.map((r) => r.headers['Idempotency-Key']).toSet(),
        {'original-operation-key'},
      );
    },
  );

  test(
    'cancel after confirmed challenge sends neither password nor new mutation',
    () async {
      final h = _Harness((_) => _challenge());
      await expectLater(
        h.run(prompt: (_, _) async => null),
        throwsA(
          isA<RecentAccountActionException>().having(
            (e) => e.confirmedNoEffect,
            'confirmed denial',
            true,
          ),
        ),
      );
      expect(h.adapter.requests, hasLength(1));
      expect(h.key, 'original-operation-key');
    },
  );

  test(
    'session unavailable before any response cannot clear a prior unknown key',
    () async {
      final h = _Harness((_) => _challenge())..headers = null;
      await expectLater(
        h.run(),
        throwsA(
          isA<RecentAccountActionException>().having(
            (e) => e.confirmedNoEffect,
            'no confirmed denial',
            false,
          ),
        ),
      );
      expect(h.adapter.requests, isEmpty);
    },
  );

  test(
    'verification offline/failure retains confirmed no-effect state and never retries mutation',
    () async {
      final h = _Harness((r) {
        if (r.uri.path.endsWith('recent-verification')) {
          throw DioException(
            requestOptions: r,
            type: DioExceptionType.connectionError,
          );
        }
        return _challenge();
      });
      await expectLater(
        h.run(),
        throwsA(
          isA<RecentAccountActionException>().having(
            (e) => e.confirmedNoEffect,
            'confirmed denial',
            true,
          ),
        ),
      );
      expect(h.adapter.requests, hasLength(2));
      expect(h.key, 'original-operation-key');
    },
  );

  test(
    'account switch while password prompt waits discards proof with no retry',
    () async {
      final h = _Harness((_) => _challenge());
      final promptStarted = Completer<void>();
      final proof = Completer<String?>();
      final pending = h.run(
        prompt: (_, _) {
          promptStarted.complete();
          return proof.future;
        },
      );
      final check = expectLater(
        pending,
        throwsA(isA<RecentAccountActionException>()),
      );
      await promptStarted.future;
      h.current = false;
      h.cancellation.cancel('account_changed');
      proof.complete(_proof);
      await check;
      expect(h.adapter.requests, hasLength(1));
    },
  );

  test(
    'repeated clicks cannot open a second prompt or send another mutation',
    () async {
      final h = _Harness((_) => _challenge());
      final opened = Completer<void>();
      final prompt = Completer<String?>();
      final first = h.run(
        prompt: (_, _) {
          opened.complete();
          return prompt.future;
        },
      );
      final firstCheck = expectLater(
        first,
        throwsA(isA<RecentAccountActionException>()),
      );
      await opened.future;
      await expectLater(h.run(), throwsA(isA<RecentAccountActionException>()));
      expect(h.adapter.requests, hasLength(1));
      prompt.complete(null);
      await firstCheck;
    },
  );

  test(
    'proof expiry on retry is returned once, no automatic password/retry loop',
    () async {
      final h = _Harness(
        (r) => r.uri.path.endsWith('recent-verification')
            ? _response(201, {'proof': _proof, 'action': 'reward_claim'})
            : _challenge(),
      );
      await expectLater(h.run(), throwsA(isA<DioException>()));
      expect(h.prompts, 1);
      expect(h.adapter.requests, hasLength(3));
    },
  );

  test(
    'post-verification unknown outcome preserves the fresh retry key and replays without another password',
    () async {
      var calls = 0;
      final h = _Harness((r) {
        if (r.uri.path.endsWith('recent-verification')) {
          return _response(201, {'proof': _proof, 'action': 'reward_claim'});
        }
        calls++;
        if (calls == 1) return _challenge();
        if (calls == 2) {
          throw DioException(
            requestOptions: r,
            type: DioExceptionType.receiveTimeout,
          );
        }
        return _response(201, {'state': 'received'});
      });
      await expectLater(h.run(), throwsA(isA<DioException>()));
      final retryKey = h.key;
      await h.run();
      expect(h.key, retryKey);
      expect(h.adapter.requests.last.headers['Idempotency-Key'], retryKey);
      expect(
        h.adapter.requests.last.headers.containsKey(
          'X-Lythaus-Action-Verification',
        ),
        isFalse,
      );
      expect(h.prompts, 1);
    },
  );

  test(
    'deletion adapter retains a fresh unknown key across status reconciliation and surfaces cancellation',
    () async {
      var mutations = 0;
      final h = _Harness((r) {
        if (r.uri.path.endsWith('recent-verification')) {
          return _response(201, {'proof': _proof, 'action': 'account_delete'});
        }
        mutations++;
        if (mutations == 1) return _challenge();
        if (mutations == 2) {
          throw DioException(
            requestOptions: r,
            type: DioExceptionType.receiveTimeout,
          );
        }
        return _response(202, {
          'requestId': 'delete-1',
          'acceptedAt': '2026-10-23T00:00:00Z',
          'state': 'received',
        });
      });
      final api = DioPrivacyApi(dio: h.dio, logger: AppLogger('fixture'));
      final verification = AccountActionVerification(
        h.client,
        (verify, _) => verify('existing password'),
      );
      await expectLater(
        api.deleteAccount(
          authToken: 'existing-access',
          verification: verification,
        ),
        throwsA(isA<PrivacyApiException>()),
      );
      final unknownKey = h.adapter.requests.last.headers['Idempotency-Key'];
      final result = await api.deleteAccount(
        authToken: 'existing-access',
        verification: verification,
      );
      expect(result.requestId, 'delete-1');
      expect(h.adapter.requests.last.headers['Idempotency-Key'], unknownKey);
      expect(
        h.adapter.requests.where(
          (r) => r.uri.path.endsWith('recent-verification'),
        ),
        hasLength(1),
      );
    },
  );
}

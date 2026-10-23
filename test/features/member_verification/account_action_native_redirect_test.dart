import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';

// Runtime-only synthetic probes. Never load stored credentials or print headers.
String _probe(int length) => List.generate(
  length,
  (_) => Random.secure().nextInt(16).toRadixString(16),
).join();

void main() {
  for (final permissiveStatus in [false, true]) {
    for (final redirectStage in [
      'initial action',
      'password verification',
      'verified action',
    ]) {
      test(
        'real native adapter refuses cross-origin 303 at $redirectStage (permissive status: $permissiveStatus)',
        () async {
          final target = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          final source = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          final sourceOrigin =
              'http://${source.address.address}:${source.port}';
          final targetOrigin =
              'http://${target.address.address}:${target.port}';
          expect(sourceOrigin != targetOrigin, isTrue);
          var targetRequests = 0, targetSawSensitiveHeaders = false;
          var actionRequests = 0, verificationRequests = 0;
          final proof = '019b2222-2222-7222-8222-222222222222.${_probe(64)}';
          target.listen((request) async {
            targetRequests++;
            targetSawSensitiveHeaders =
                request.headers.value('x-lythaus-session-binding') != null ||
                request.headers.value('x-lythaus-action-verification') !=
                    null ||
                request.headers.value('authorization') != null;
            await request.drain<void>();
            request.response.headers.contentType = ContentType.json;
            request.response.write(
              jsonEncode({
                'state': 'received',
                'proof': proof,
                'action': 'reward_claim',
              }),
            );
            await request.response.close();
          });
          source.listen((request) async {
            await request.drain<void>();
            final verification =
                request.uri.path == '/api/auth/recent-verification';
            if (verification) {
              verificationRequests++;
            } else {
              actionRequests++;
            }
            final redirect =
                redirectStage == 'initial action' ||
                (redirectStage == 'password verification' && verification) ||
                (redirectStage == 'verified action' &&
                    !verification &&
                    actionRequests == 2);
            if (redirect) {
              request.response.statusCode = 303;
              request.response.headers.set(
                HttpHeaders.locationHeader,
                '$targetOrigin/redirect-target',
              );
            } else {
              request.response.statusCode = verification ? 201 : 403;
              request.response.headers.contentType = ContentType.json;
              request.response.write(
                jsonEncode(
                  verification
                      ? {'proof': proof, 'action': 'reward_claim'}
                      : {'error': 'recent_authentication_required'},
                ),
              );
            }
            await request.response.close();
          });
          final dio =
              Dio(
                  BaseOptions(
                    baseUrl: sourceOrigin,
                    // A permissive inherited status predicate must not accept redirects.
                    validateStatus: permissiveStatus ? (_) => true : null,
                    connectTimeout: const Duration(seconds: 3),
                    receiveTimeout: const Duration(seconds: 3),
                  ),
                )
                ..httpClientAdapter = IOHttpClientAdapter(
                  createHttpClient: () =>
                      HttpClient()..findProxy = (_) => 'DIRECT',
                );
          final cancellation = CancelToken();
          final client = RecentAccountActionClient(
            dio: dio,
            sessionHeaders: () async => {
              'Authorization': 'Bearer ${_probe(40)}',
              'X-Lythaus-Session-Binding': _probe(48),
            },
            isCurrent: () => true,
            sessionCancellation: cancellation,
          );
          var failedClosed = false;
          try {
            try {
              await client.post(
                path: '/api/rewards/example/redeem',
                body: '',
                idempotencyKey: 'synthetic-operation-key',
                onRetryKey: (_) {},
                passwordPrompt: (verify, _) => verify(_probe(24)),
              );
            } on DioException catch (error) {
              failedClosed = error.response?.statusCode == 303;
            } on RecentAccountActionException catch (error) {
              failedClosed =
                  redirectStage == 'password verification' &&
                  error.confirmedNoEffect;
            }
            // Boolean assertions prevent any synthetic probe values entering logs.
            // Evidence is counts/booleans only; never emit header values.
            // ignore: avoid_print
            print(
              'redirect stage=$redirectStage permissive=$permissiveStatus target_requests=$targetRequests sensitive_headers_forwarded=$targetSawSensitiveHeaders',
            );
            expect(
              failedClosed,
              isTrue,
              reason:
                  'A redirect must not be accepted as account-action success',
            );
            expect(
              targetRequests == 0,
              isTrue,
              reason: 'No request may reach the redirect origin',
            );
            expect(targetSawSensitiveHeaders, isFalse);
            expect(actionRequests, redirectStage == 'verified action' ? 2 : 1);
            expect(
              verificationRequests,
              redirectStage == 'initial action' ? 0 : 1,
            );
          } finally {
            cancellation.cancel('test_finished');
            dio.close(force: true);
            await source.close(force: true);
            await target.close(force: true);
          }
        },
      );
    }
  }
}

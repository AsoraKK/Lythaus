import 'dart:js_interop';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:lythaus/features/member_verification/application/account_action_transport_web.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';

@JS('lythausAccountRedirectResult')
external set _result(JSString value);

Future<void> main() async {
  final stage = Uri.base.queryParameters['stage'] ?? 'initial_action';
  final probe = List.generate(
    48,
    (_) => Random.secure().nextInt(16).toRadixString(16),
  ).join();
  final dio = accountActionTransport(
    Dio(BaseOptions(baseUrl: Uri.base.origin)),
  );
  final cancellation = CancelToken();
  final client = RecentAccountActionClient(
    dio: dio,
    sessionHeaders: () async => {
      'Authorization': 'Bearer $probe',
      'X-Lythaus-Auth-Transport': 'cookie-v1',
    },
    isCurrent: () => true,
    sessionCancellation: cancellation,
  );
  try {
    await client.post(
      path: '/api/rewards/$stage/redeem',
      body: '',
      idempotencyKey: 'synthetic-browser-operation',
      onRetryKey: (_) {},
      passwordPrompt: (verify, _) => verify(probe),
    );
    _result = 'completed'.toJS;
  } catch (_) {
    // Expose only a fixed result; never expose requests, probes or passwords.
    _result = 'blocked'.toJS;
  } finally {
    cancellation.cancel('test_finished');
    disposeAccountActionTransport(dio);
  }
}

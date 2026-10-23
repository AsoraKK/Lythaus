import 'package:dio/dio.dart';
import 'package:http/browser_client.dart';
import 'package:lythaus/features/member_verification/application/account_action_http_adapter.dart';

/// Only the explicitly enabled account-action client carries the existing
/// HttpOnly session cookie. Do not change the shared client's default behavior.
Dio accountActionTransport(Dio existing) => existing.clone(
  httpClientAdapter: AccountActionHttpAdapter(
    BrowserClient()..withCredentials = true,
  ),
);

/// Dispose only the isolated browser adapter, never the shared secure client.
void disposeAccountActionTransport(Dio dio) => dio.close(force: true);

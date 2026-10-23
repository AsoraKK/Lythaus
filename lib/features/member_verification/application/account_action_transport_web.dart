import 'package:dio/browser.dart';
import 'package:dio/dio.dart';

/// Only the explicitly enabled account-action client carries the existing
/// HttpOnly session cookie. Do not change the shared client's default behavior.
Dio accountActionTransport(Dio existing) => existing.clone(
  httpClientAdapter: BrowserHttpClientAdapter(withCredentials: true),
);

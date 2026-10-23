// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;

/// Browser Dio uses XHR, whose redirect behavior cannot be disabled. Reuse the
/// existing Fetch-backed HTTP client with redirect:error and cookie credentials.
/// This adapter belongs only to the disabled account-action client.
class AccountActionHttpAdapter implements HttpClientAdapter {
  AccountActionHttpAdapter(this._client);
  final http.Client _client;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final abort = Completer<void>();
    void cancel() {
      if (!abort.isCompleted) abort.complete();
    }

    unawaited(cancelFuture?.then((_) => cancel()));
    final request =
        http.AbortableRequest(
            options.method,
            options.uri,
            abortTrigger: abort.future,
          )
          ..followRedirects = false
          ..headers.addAll(
            options.headers.map(
              (key, value) => MapEntry(key, value.toString()),
            ),
          )
          ..bodyBytes = requestStream == null
              ? []
              : await requestStream.expand((chunk) => chunk).toList();
    final timeout = options.receiveTimeout ?? const Duration(seconds: 30);
    try {
      return await (() async {
        final response = await _client.send(request);
        final bytes = await response.stream.toBytes();
        return ResponseBody.fromBytes(
          bytes,
          response.statusCode,
          headers: response.headers.map((key, value) => MapEntry(key, [value])),
          statusMessage: response.reasonPhrase,
          isRedirect: response.isRedirect,
        );
      })().timeout(
        timeout,
        onTimeout: () {
          cancel();
          throw DioException.receiveTimeout(
            timeout: timeout,
            requestOptions: options,
          );
        },
      );
    } on http.ClientException {
      // Do not attach a request, password or credential value to the message.
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'Account action connection could not be confirmed',
      );
    }
  }

  @override
  void close({bool force = false}) => _client.close();
}

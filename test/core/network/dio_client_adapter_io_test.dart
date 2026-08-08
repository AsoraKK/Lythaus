import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/network/dio_client_adapter_io.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dart:io';
import 'dart:typed_data';

EnvironmentConfig _config({required bool enabled}) {
  return EnvironmentConfig(
    environment: Environment.development,
    apiBaseUrl: 'https://api.example.com',
    security: MobileSecurityConfig(
      tlsPins: TlsPinConfig(
        enabled: enabled,
        strictMode: true,
        spkiPinsBase64: const ['abc'],
      ),
      strictDeviceIntegrity: true,
      blockRootedDevices: true,
    ),
  );
}

class _SentinelAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString('sentinel', 200);
  }

  @override
  void close({bool force = false}) {}
}

class _FakeCertificate implements X509Certificate {
  @override
  Uint8List get der => Uint8List(0);

  @override
  String get pem => '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';

  @override
  Uint8List get sha1 => Uint8List(0);

  @override
  String get subject => 'CN=test';

  @override
  String get issuer => 'CN=test';

  @override
  DateTime get startValidity => DateTime(2026);

  @override
  DateTime get endValidity => DateTime(2027);
}

void main() {
  test('configureSecureHttpClientAdapter keeps http clients untouched', () {
    final dio = Dio();
    final sentinel = _SentinelAdapter();
    dio.httpClientAdapter = sentinel;
    configureSecureHttpClientAdapter(
      dio,
      _config(enabled: true),
      'http://localhost:8080/api',
    );

    expect(dio.httpClientAdapter, same(sentinel));
  });

  test('configureSecureHttpClientAdapter installs IO adapter for https', () {
    final dio = Dio();
    configureSecureHttpClientAdapter(
      dio,
      _config(enabled: true),
      'https://api.example.com',
    );

    expect(dio.httpClientAdapter, isA<IOHttpClientAdapter>());
    final adapter = dio.httpClientAdapter as IOHttpClientAdapter;
    expect(adapter.validateCertificate, isNotNull);
    expect(adapter.validateCertificate!(null, 'api.example.com', 443), isFalse);
    expect(
      adapter.validateCertificate!(
        _FakeCertificate(),
        'other.example.com',
        443,
      ),
      isTrue,
    );
  });

  test('configureSecureHttpClientAdapter respects disabled pinning', () {
    final dio = Dio();
    final sentinel = _SentinelAdapter();
    dio.httpClientAdapter = sentinel;
    configureSecureHttpClientAdapter(
      dio,
      _config(enabled: false),
      'https://api.example.com',
    );

    expect(dio.httpClientAdapter, same(sentinel));
  });
}

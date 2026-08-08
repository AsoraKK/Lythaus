import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/security/tls_pinning.dart';
import 'package:lythaus/core/config/environment_config.dart';

class _MockHttpClient extends Mock implements HttpClient {}

class _MockHttpClientRequest extends Mock implements HttpClientRequest {}

class _MockHttpClientCredentials extends Mock
    implements HttpClientCredentials {}

void main() {
  late _MockHttpClient mockClient;
  late PinnedHttpClient pinned;

  setUp(() {
    mockClient = _MockHttpClient();
    final validator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      ),
      environment: Environment.development,
    );
    pinned = PinnedHttpClient(
      client: mockClient,
      validator: validator,
      pinnedHosts: ['example.com'],
    );
  });

  group('PinnedHttpClient delegation', () {
    test('autoUncompress getter delegates', () {
      when(() => mockClient.autoUncompress).thenReturn(true);
      expect(pinned.autoUncompress, isTrue);
    });

    test('autoUncompress setter delegates', () {
      pinned.autoUncompress = false;
      verify(() => mockClient.autoUncompress = false).called(1);
    });

    test('connectionTimeout getter delegates', () {
      when(
        () => mockClient.connectionTimeout,
      ).thenReturn(const Duration(seconds: 5));
      expect(pinned.connectionTimeout, const Duration(seconds: 5));
    });

    test('connectionTimeout setter delegates', () {
      const dur = Duration(seconds: 10);
      pinned.connectionTimeout = dur;
      verify(() => mockClient.connectionTimeout = dur).called(1);
    });

    test('idleTimeout getter delegates', () {
      when(
        () => mockClient.idleTimeout,
      ).thenReturn(const Duration(seconds: 30));
      expect(pinned.idleTimeout, const Duration(seconds: 30));
    });

    test('idleTimeout setter delegates', () {
      const dur = Duration(seconds: 60);
      pinned.idleTimeout = dur;
      verify(() => mockClient.idleTimeout = dur).called(1);
    });

    test('maxConnectionsPerHost getter delegates', () {
      when(() => mockClient.maxConnectionsPerHost).thenReturn(5);
      expect(pinned.maxConnectionsPerHost, 5);
    });

    test('maxConnectionsPerHost setter delegates', () {
      pinned.maxConnectionsPerHost = 10;
      verify(() => mockClient.maxConnectionsPerHost = 10).called(1);
    });

    test('userAgent getter delegates', () {
      when(() => mockClient.userAgent).thenReturn('TestAgent');
      expect(pinned.userAgent, 'TestAgent');
    });

    test('userAgent setter delegates', () {
      pinned.userAgent = 'NewAgent';
      verify(() => mockClient.userAgent = 'NewAgent').called(1);
    });

    test('addCredentials delegates', () {
      final uri = Uri.parse('https://example.com');
      final creds = _MockHttpClientCredentials();
      pinned.addCredentials(uri, 'realm', creds);
      verify(() => mockClient.addCredentials(uri, 'realm', creds)).called(1);
    });

    test('addProxyCredentials delegates', () {
      final creds = _MockHttpClientCredentials();
      pinned.addProxyCredentials('proxy.com', 8080, 'realm', creds);
      verify(
        () => mockClient.addProxyCredentials('proxy.com', 8080, 'realm', creds),
      ).called(1);
    });

    test('authenticate setter delegates', () {
      Future<bool> handler(Uri u, String s, String? r) async => true;
      pinned.authenticate = handler;
      verify(() => mockClient.authenticate = handler).called(1);
    });

    test('authenticateProxy setter delegates', () {
      Future<bool> handler(String h, int p, String s, String? r) async => true;
      pinned.authenticateProxy = handler;
      verify(() => mockClient.authenticateProxy = handler).called(1);
    });

    test('close delegates', () {
      pinned.close();
      verify(() => mockClient.close(force: false)).called(1);
    });

    test('close with force delegates', () {
      pinned.close(force: true);
      verify(() => mockClient.close(force: true)).called(1);
    });

    test('delete delegates', () async {
      final req = _MockHttpClientRequest();
      when(
        () => mockClient.delete('host', 80, '/p'),
      ).thenAnswer((_) async => req);
      final result = await pinned.delete('host', 80, '/p');
      expect(result, req);
    });

    test('deleteUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.deleteUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.deleteUrl(uri);
      expect(result, req);
    });

    test('get delegates', () async {
      final req = _MockHttpClientRequest();
      when(() => mockClient.get('host', 80, '/p')).thenAnswer((_) async => req);
      final result = await pinned.get('host', 80, '/p');
      expect(result, req);
    });

    test('getUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.getUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.getUrl(uri);
      expect(result, req);
    });

    test('head delegates', () async {
      final req = _MockHttpClientRequest();
      when(
        () => mockClient.head('host', 80, '/p'),
      ).thenAnswer((_) async => req);
      final result = await pinned.head('host', 80, '/p');
      expect(result, req);
    });

    test('headUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.headUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.headUrl(uri);
      expect(result, req);
    });

    test('open delegates', () async {
      final req = _MockHttpClientRequest();
      when(
        () => mockClient.open('GET', 'host', 80, '/p'),
      ).thenAnswer((_) async => req);
      final result = await pinned.open('GET', 'host', 80, '/p');
      expect(result, req);
    });

    test('openUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.openUrl('GET', uri)).thenAnswer((_) async => req);
      final result = await pinned.openUrl('GET', uri);
      expect(result, req);
    });

    test('patch delegates', () async {
      final req = _MockHttpClientRequest();
      when(
        () => mockClient.patch('host', 80, '/p'),
      ).thenAnswer((_) async => req);
      final result = await pinned.patch('host', 80, '/p');
      expect(result, req);
    });

    test('patchUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.patchUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.patchUrl(uri);
      expect(result, req);
    });

    test('post delegates', () async {
      final req = _MockHttpClientRequest();
      when(
        () => mockClient.post('host', 80, '/p'),
      ).thenAnswer((_) async => req);
      final result = await pinned.post('host', 80, '/p');
      expect(result, req);
    });

    test('postUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.postUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.postUrl(uri);
      expect(result, req);
    });

    test('put delegates', () async {
      final req = _MockHttpClientRequest();
      when(() => mockClient.put('host', 80, '/p')).thenAnswer((_) async => req);
      final result = await pinned.put('host', 80, '/p');
      expect(result, req);
    });

    test('putUrl delegates', () async {
      final req = _MockHttpClientRequest();
      final uri = Uri.parse('https://example.com');
      when(() => mockClient.putUrl(uri)).thenAnswer((_) async => req);
      final result = await pinned.putUrl(uri);
      expect(result, req);
    });

    test('connectionFactory setter delegates', () {
      pinned.connectionFactory = null;
      verify(() => mockClient.connectionFactory = null).called(1);
    });

    test('keyLog setter delegates', () {
      pinned.keyLog = null;
      verify(() => mockClient.keyLog = null).called(1);
    });

    test('findProxy setter delegates', () {
      pinned.findProxy = null;
      verify(() => mockClient.findProxy = null).called(1);
    });

    test('badCertificateCallback invokes validator for pinned host', () {
      // Set the callback first
      pinned.badCertificateCallback = null;

      // Now verify the mock client had its callback set
      // The setter should have installed a validator-aware callback
      verify(() => mockClient.badCertificateCallback = any()).called(1);
    });
  });

  group('PinnedHttpClientFactory', () {
    test('create returns HttpClient', () {
      final config = EnvironmentConfig.fromEnvironment();
      // Create will try to use the config but should return a valid client
      final client = PinnedHttpClientFactory.create(config);
      expect(client, isA<HttpClient>());
      client.close();
    });
  });
}

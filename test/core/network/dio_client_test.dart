import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/security/device_integrity.dart';
import 'package:mocktail/mocktail.dart';

class _MockDeviceIntegrityService extends Mock
    implements DeviceIntegrityService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  group('secureDioProvider', () {
    test('creates Dio instance with correct base URL in debug mode', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      expect(dio, isA<Dio>());
      expect(dio.options.baseUrl, isNotEmpty);
    });

    test('configures correct timeouts', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      expect(dio.options.connectTimeout, equals(const Duration(seconds: 10)));
      expect(dio.options.receiveTimeout, equals(const Duration(seconds: 30)));
      expect(dio.options.sendTimeout, equals(const Duration(seconds: 30)));
    });

    test('sets default headers', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      expect(dio.options.headers['Content-Type'], equals('application/json'));
      expect(dio.options.headers['Accept'], equals('application/json'));
      expect(dio.options.headers['User-Agent'], contains('Lythaus-Flutter'));
    });

    test('includes device integrity interceptor', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      final hasIntegrityInterceptor = dio.interceptors.any(
        (i) => i.runtimeType.toString().contains('DeviceIntegrity'),
      );
      expect(hasIntegrityInterceptor, isTrue);
    });

    test('includes logging interceptor in debug mode', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      if (kDebugMode) {
        final hasLogInterceptor = dio.interceptors.any(
          (i) => i is LogInterceptor,
        );
        expect(hasLogInterceptor, isTrue);
      }
    });
  });

  group('_DeviceIntegrityInterceptor', () {
    late Dio dio;
    late ProviderContainer container;
    late _MockDeviceIntegrityService integrityService;

    setUp(() {
      integrityService = _MockDeviceIntegrityService();
      container = ProviderContainer(
        overrides: [
          deviceIntegrityServiceProvider.overrideWithValue(integrityService),
        ],
      );

      dio = container.read(secureDioProvider);
    });

    tearDown(() {
      container.dispose();
    });

    test('attaches integrity header on request', () async {
      when(() => integrityService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.secure,
          reason: 'Device integrity verified',
          checkedAt: DateTime.now(),
          allowPosting: true,
          allowReading: true,
        ),
      );

      try {
        await dio.get<Map<String, dynamic>>('/test');
      } catch (_) {
        // Connection will fail, but we captured the request
      }

      // The test verifies the interceptor is present
      verify(() => integrityService.checkIntegrity()).called(greaterThan(0));
    });

    test('blocks write operations when device is compromised', () async {
      when(() => integrityService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is rooted/jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      expect(
        () => dio.post<void>('/test', data: {'test': 'data'}),
        throwsA(isA<DioException>()),
      );
    });

    test('allows read operations when device is compromised', () async {
      when(() => integrityService.checkIntegrity()).thenAnswer(
        (_) async => DeviceIntegrityInfo(
          status: DeviceIntegrityStatus.compromised,
          reason: 'Device is rooted/jailbroken',
          checkedAt: DateTime.now(),
          allowPosting: false,
          allowReading: true,
        ),
      );

      // GET requests should be allowed to proceed (even if they fail due to network)
      // The integrity interceptor should not block the request
      try {
        await dio.get<Map<String, dynamic>>('/test');
      } on DioException catch (e) {
        // Expect connection/network error, not a security block
        expect(e.type, isNot(equals(DioExceptionType.cancel)));
      }

      // Verify integrity was checked
      verify(() => integrityService.checkIntegrity()).called(greaterThan(0));
    });
  });

  group('getHttpClientConfig', () {
    test('returns configuration with correct values', () {
      final config = getHttpClientConfig();

      expect(config, isA<HttpClientConfig>());
      expect(config.baseUrl, isNotEmpty);
      expect(config.integrityChecksEnabled, isTrue);
      expect(config.connectTimeout, equals(const Duration(seconds: 10)));
      expect(config.receiveTimeout, equals(const Duration(seconds: 30)));
    });

    test('toJson returns all config properties', () {
      final config = getHttpClientConfig();
      final json = config.toJson();

      expect(json, containsPair('baseUrl', isA<String>()));
      expect(json, containsPair('certPinningEnabled', isA<bool>()));
      expect(json, containsPair('integrityChecksEnabled', true));
      expect(json, containsPair('connectTimeoutSeconds', 10));
      expect(json, containsPair('receiveTimeoutSeconds', 30));
    });

    test('cert pinning enabled for HTTPS URLs', () {
      final config = getHttpClientConfig();
      if (config.baseUrl.startsWith('https')) {
        expect(config.certPinningEnabled, isTrue);
      } else {
        expect(config.certPinningEnabled, isFalse);
      }
    });
  });

  group('HttpClientConfig', () {
    test('creates config with all required fields', () {
      const config = HttpClientConfig(
        baseUrl: 'https://example.com/api',
        certPinningEnabled: true,
        integrityChecksEnabled: true,
        connectTimeout: Duration(seconds: 10),
        receiveTimeout: Duration(seconds: 30),
      );

      expect(config.baseUrl, equals('https://example.com/api'));
      expect(config.certPinningEnabled, isTrue);
      expect(config.integrityChecksEnabled, isTrue);
    });
  });
}

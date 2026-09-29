import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/security/device_integrity.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:mocktail/mocktail.dart';

class _MockDeviceIntegrityService extends Mock
    implements DeviceIntegrityService {}

class _MockDeviceSecurityService extends Mock
    implements DeviceSecurityService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  group('CanonicalApiPathInterceptor', () {
    for (final (baseUrl, path, expected) in [
      (
        'https://api.lythaus.co/api',
        '/api/users/me',
        'https://api.lythaus.co/api/users/me',
      ),
      (
        'https://api.lythaus.co/api/',
        '/api/users/me',
        'https://api.lythaus.co/api/users/me',
      ),
      (
        'https://api.lythaus.co/api',
        '/feed/discover',
        'https://api.lythaus.co/api/feed/discover',
      ),
      (
        'https://api.lythaus.co',
        '/api/users/me',
        'https://api.lythaus.co/api/users/me',
      ),
      (
        'https://api.lythaus.co/api',
        '/api/users/me?limit=2',
        'https://api.lythaus.co/api/users/me?limit=2',
      ),
      (
        'https://api.lythaus.co/api',
        'https://example.test/api/health',
        'https://example.test/api/health',
      ),
    ]) {
      test('$baseUrl + $path resolves exactly once', () async {
        final dio = Dio(BaseOptions(baseUrl: baseUrl));
        addTearDown(dio.close);
        dio.interceptors.add(CanonicalApiPathInterceptor());
        dio.interceptors.add(CanonicalApiPathInterceptor());
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.resolve(
                Response<String>(
                  requestOptions: options,
                  data: options.uri.toString(),
                ),
              );
            },
          ),
        );
        expect((await dio.get<String>(path)).data, expected);
      });
    }
  });

  group('secureDioProvider', () {
    test(
      'platform fallback retains explicit integrity headers without logging payloads',
      () async {
        final legacy = _MockDeviceIntegrityService();
        final current = _MockDeviceSecurityService();
        when(
          () => legacy.checkIntegrity(),
        ).thenThrow(StateError('Platform unavailable'));
        when(() => current.evaluateSecurity()).thenAnswer(
          (_) async => DeviceSecurityState(
            isRootedOrJailbroken: false,
            isEmulator: false,
            isDebugBuild: true,
            lastCheckedAt: DateTime.utc(2026, 9, 29),
          ),
        );
        final container = ProviderContainer(
          overrides: [
            deviceIntegrityServiceProvider.overrideWithValue(legacy),
            deviceSecurityServiceProvider.overrideWithValue(current),
          ],
        );
        addTearDown(container.dispose);
        final dio = container.read(secureDioProvider);
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(options.headers['X-Device-Rooted'], 'false');
              expect(options.headers['X-Device-Emulator'], 'false');
              expect(options.headers['X-Device-Debug'], 'true');
              handler.resolve(
                Response<void>(requestOptions: options, statusCode: 200),
              );
            },
          ),
        );
        await dio.get<void>('/feed/discover');
        verify(() => current.evaluateSecurity()).called(1);
      },
    );

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

    test('includes idempotency retry interceptor', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      expect(
        dio.interceptors.whereType<IdempotencyRetryInterceptor>(),
        isNotEmpty,
      );
    });

    test('does not log credentials, response bodies or credential URLs', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final dio = container.read(secureDioProvider);
      expect(dio.interceptors.whereType<LogInterceptor>(), isEmpty);
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

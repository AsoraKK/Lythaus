// ignore_for_file: public_member_api_docs

/// LYTHAUS SECURE DIO CLIENT
///
/// 🎯 Purpose: Secure HTTP client with certificate pinning and integrity checks
/// 🔐 Security: SPKI pinning, device integrity validation, secure headers
/// 📡 Network: Native Lythaus API integration with proper error handling
/// 🧪 Testing: Live Test Mode header injection for data isolation
/// 📱 Platform: Flutter with Riverpod dependency injection
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/device_integrity.dart';
import 'package:lythaus/core/security/security_overrides.dart';
import 'package:lythaus/core/security/security_telemetry.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/network/dio_client_adapter_stub.dart'
    if (dart.library.io) 'dio_client_adapter_io.dart'
    if (dart.library.html) 'dio_client_adapter_web.dart';

/// Secure Dio client provider with certificate pinning and integrity checks
final secureDioProvider = Provider<Dio>((ref) {
  final envConfig = EnvironmentConfig.fromEnvironment();
  final baseUrl = envConfig.apiBaseUrl;

  // Create Dio instance
  final dio = Dio(BaseOptions(baseUrl: baseUrl));

  configureSecureHttpClientAdapter(dio, envConfig, baseUrl);

  // Configure timeouts
  dio.options.connectTimeout = const Duration(seconds: 10);
  dio.options.receiveTimeout = const Duration(seconds: 30);
  dio.options.sendTimeout = const Duration(seconds: 30);

  // Set default headers
  dio.options.headers.addAll({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Lythaus-Flutter/${_getAppVersion()}',
  });

  // Add device integrity interceptor
  dio.interceptors.add(_DeviceIntegrityInterceptor(ref));

  // Add logging in debug mode
  if (kDebugMode) {
    dio.interceptors.add(
      LogInterceptor(
        requestBody: true,
        responseBody: true,
        requestHeader: false,
        responseHeader: false,
        error: true,
        logPrint: (object) => debugPrint('🌐 HTTP: $object'),
      ),
    );
  }

  return dio;
});

/// Device integrity interceptor
// Internal unified integrity info to normalize across older/newer services
class _UnifiedIntegrityInfo {
  final bool isCompromised;
  final bool isEmulator;
  final bool isDebugBuild;
  final bool allowPosting;
  final bool allowReading;
  final Map<String, dynamic> metadata;

  _UnifiedIntegrityInfo({
    required this.isCompromised,
    required this.isEmulator,
    required this.isDebugBuild,
    required this.allowPosting,
    required this.allowReading,
    required this.metadata,
  });
}

class _DeviceIntegrityInterceptor extends Interceptor {
  final Ref _ref;

  _DeviceIntegrityInterceptor(this._ref);

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Try to use legacy/new device integrity provider if present (used by tests)
    _UnifiedIntegrityInfo securityState;
    try {
      // Prefer DeviceIntegrityService API (device_integrity.dart)
      final legacyService = _ref.read(deviceIntegrityServiceProvider);
      final info = await legacyService.checkIntegrity();
      securityState = _UnifiedIntegrityInfo(
        isCompromised: info.isCompromised,
        isEmulator: false,
        isDebugBuild: kDebugMode,
        allowPosting: info.allowPosting,
        allowReading: info.allowReading,
        metadata: info.toJson(),
      );
    } catch (_) {
      // Fallback to DeviceSecurityService (device_security_service.dart)
      final deviceService = _ref.read(deviceSecurityServiceProvider);
      final state = await deviceService.evaluateSecurity();
      securityState = _UnifiedIntegrityInfo(
        isCompromised: state.isCompromised,
        isEmulator: state.isEmulator,
        isDebugBuild: state.isDebugBuild,
        allowPosting: !state.isCompromised,
        allowReading: true,
        metadata: state.toJson(),
      );
    }

    // Always attach integrity headers for backend validation
    options.headers['X-Device-Rooted'] = securityState.isCompromised.toString();
    options.headers['X-Device-Emulator'] = securityState.isEmulator.toString();
    options.headers['X-Device-Debug'] = securityState.isDebugBuild.toString();

    // Check for active security overrides
    final overrides = SecurityOverridesProvider.current;
    if (overrides.relaxDeviceIntegrity && overrides.isValid()) {
      // Override active: log and proceed
      final event = SecurityEvent.securityOverride(
        result: 'override_applied',
        reason: overrides.overrideReason ?? 'unknown',
        environment: EnvironmentConfig.fromEnvironment().environment,
        metadata: {
          'override_type': 'device_integrity',
          ...securityState.metadata,
        },
      );
      SecurityTelemetry.logEvent(event);
      handler.next(options);
      return;
    }

    // Block write operations if device is compromised (production only)
    final envConfig = EnvironmentConfig.fromEnvironment();
    final isWriteOperation = [
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ].contains(options.method.toUpperCase());

    if (isWriteOperation &&
        securityState.isCompromised &&
        envConfig.security.blockRootedDevices &&
        envConfig.environment.isProd) {
      final payload = {
        'code': ErrorCodes.deviceIntegrityBlocked,
        'message': ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked),
      };
      final error = DioException(
        requestOptions: options,
        response: Response<Map<String, dynamic>>(
          requestOptions: options,
          statusCode: 403,
          data: payload,
        ),
        type: DioExceptionType.badResponse,
        message: payload['message'],
      );
      handler.reject(error);
      return;
    }

    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // Log security-relevant errors
    if (err.response?.statusCode == 403) {
      debugPrint('🚨 SECURITY: Access denied - possible integrity issue');
    }

    handler.next(err);
  }
}

/// Get app version for User-Agent header
String _getAppVersion() {
  // In production, get from package_info_plus or similar
  return kDebugMode ? 'dev' : '1.0.0';
}

/// HTTP client configuration info
class HttpClientConfig {
  final String baseUrl;
  final bool certPinningEnabled;
  final bool integrityChecksEnabled;
  final Duration connectTimeout;
  final Duration receiveTimeout;

  const HttpClientConfig({
    required this.baseUrl,
    required this.certPinningEnabled,
    required this.integrityChecksEnabled,
    required this.connectTimeout,
    required this.receiveTimeout,
  });

  Map<String, dynamic> toJson() => {
    'baseUrl': baseUrl,
    'certPinningEnabled': certPinningEnabled,
    'integrityChecksEnabled': integrityChecksEnabled,
    'connectTimeoutSeconds': connectTimeout.inSeconds,
    'receiveTimeoutSeconds': receiveTimeout.inSeconds,
  };
}

/// Get current HTTP client configuration
HttpClientConfig getHttpClientConfig() {
  final envConfig = EnvironmentConfig.fromEnvironment();

  return HttpClientConfig(
    baseUrl: envConfig.apiBaseUrl,
    // Only enable cert pinning when talking to HTTPS endpoints
    certPinningEnabled: envConfig.apiBaseUrl.startsWith('https')
        ? envConfig.security.tlsPins.enabled
        : false,
    // In debug mode, keep integrity checks enabled for testing; otherwise use env config
    integrityChecksEnabled:
        envConfig.security.strictDeviceIntegrity || kDebugMode,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
  );
}

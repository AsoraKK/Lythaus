// ignore_for_file: public_member_api_docs

/// LYTHAUS ENVIRONMENT CONFIGURATION
///
/// 🎯 Purpose: Environment-specific configuration (local/preview/MVP live)
/// 🔐 Security: Embeds TLS pins and device integrity policies per environment
/// 📱 Platform: Flutter multi-environment support
library;

import 'package:flutter/foundation.dart';
import 'package:lythaus/core/config/web_release_guard.dart';

/// Environment enumeration
enum Environment {
  development,
  preview,
  production;

  /// Get current environment from build configuration
  static Environment get current {
    const envString = String.fromEnvironment('ENVIRONMENT', defaultValue: '');

    if (envString.isEmpty) {
      return kIsWeb && kReleaseMode
          ? Environment.production
          : Environment.development;
    }

    switch (envString.toLowerCase()) {
      case 'production':
      case 'prod':
        return Environment.production;
      case 'preview':
      case 'pr':
        return Environment.preview;
      case 'development':
      case 'dev':
      default:
        return Environment.development;
    }
  }

  bool get isDev => this == Environment.development;
  bool get isPreview => this == Environment.preview;
  bool get isProd => this == Environment.production;
}

/// TLS certificate pinning configuration
enum PinLifecycleState { live, planned, deprecated, disabled }

class TlsPinConfig {
  final bool enabled;
  final bool strictMode; // true = block, false = warn-only
  final PinLifecycleState lifecycleState;
  final List<String> spkiPinsBase64; // SPKI SHA-256 pins, Base64

  const TlsPinConfig({
    required this.enabled,
    required this.strictMode,
    this.lifecycleState = PinLifecycleState.live,
    required this.spkiPinsBase64,
  });

  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'strictMode': strictMode,
    'lifecycleState': lifecycleState.name,
    'pinCount': spkiPinsBase64.length,
  };
}

/// Mobile security configuration
class MobileSecurityConfig {
  final TlsPinConfig tlsPins;
  final bool strictDeviceIntegrity;
  final bool blockRootedDevices;
  final bool allowRootedInPreviewForQa;

  const MobileSecurityConfig({
    required this.tlsPins,
    required this.strictDeviceIntegrity,
    required this.blockRootedDevices,
    this.allowRootedInPreviewForQa = false,
  });

  Map<String, dynamic> toJson() => {
    'tlsPins': tlsPins.toJson(),
    'strictDeviceIntegrity': strictDeviceIntegrity,
    'blockRootedDevices': blockRootedDevices,
    'allowRootedInPreviewForQa': allowRootedInPreviewForQa,
  };
}

/// Complete environment configuration
class EnvironmentConfig {
  final Environment environment;
  final String apiBaseUrl;
  final MobileSecurityConfig security;

  const EnvironmentConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.security,
  });

  /// Get configuration for current environment
  factory EnvironmentConfig.fromEnvironment() {
    final env = Environment.current;

    if (isReleaseWebBuild) {
      if (env.isDev) {
        throw StateError(
          'ENVIRONMENT=development is not allowed for release web builds.',
        );
      }

      final apiBaseUrl = requirePublicHttpsOrigin(
        'API_BASE_URL',
        const String.fromEnvironment('API_BASE_URL', defaultValue: ''),
      ).toString();

      return EnvironmentConfig(
        environment: env,
        apiBaseUrl: apiBaseUrl,
        security: env.isPreview ? _previewMobileSecurity : _prodMobileSecurity,
      );
    }

    switch (env) {
      case Environment.development:
        return _devConfig;
      case Environment.preview:
        return _previewConfig;
      case Environment.production:
        return _prodConfig;
    }
  }

  /// Returns the [EnvironmentConfig] for the specified [env].
  ///
  /// Intended for tests and tooling (launch-readiness gate, pin validation).
  /// Production code should use [EnvironmentConfig.fromEnvironment].
  @visibleForTesting
  static EnvironmentConfig configForEnvironment(Environment env) {
    switch (env) {
      case Environment.development:
        return _devConfig;
      case Environment.preview:
        return _previewConfig;
      case Environment.production:
        return _prodConfig;
    }
  }

  Map<String, dynamic> toJson() => {
    'environment': environment.name,
    'apiBaseUrl': apiBaseUrl,
    'security': security.toJson(),
  };
}

// Pinning is disabled for the shared MVP until Cloudflare certificate rotation
// and rollback are rehearsed with a current and backup public-gateway pin.
const _devMobileSecurity = MobileSecurityConfig(
  tlsPins: TlsPinConfig(
    enabled: false,
    strictMode: false,
    lifecycleState: PinLifecycleState.disabled,
    spkiPinsBase64: [],
  ),
  strictDeviceIntegrity: false,
  blockRootedDevices: false,
  allowRootedInPreviewForQa: false,
);

const _devConfig = EnvironmentConfig(
  environment: Environment.development,
  apiBaseUrl: kIsWeb
      ? 'http://localhost:8787/api' // Local public Worker on web
      : 'http://10.0.2.2:8787/api', // Android emulator loopback
  security: _devMobileSecurity,
);

// Preview security posture. Cloudflare preview builds must supply API_BASE_URL
// explicitly; there is no permanent preview API or secondary backend.
const _previewMobileSecurity = MobileSecurityConfig(
  tlsPins: TlsPinConfig(
    enabled: false,
    strictMode: false,
    lifecycleState: PinLifecycleState.disabled,
    spkiPinsBase64: [],
  ),
  strictDeviceIntegrity: true,
  blockRootedDevices: true,
  allowRootedInPreviewForQa: false,
);

const _previewConfig = EnvironmentConfig(
  environment: Environment.preview,
  apiBaseUrl: 'https://api.lythaus.co/api',
  security: _previewMobileSecurity,
);

// MVP production deliberately relies on platform TLS validation. Strict SPKI
// pinning must not be re-enabled until the public gateway pin lifecycle is proven.
const _prodMobileSecurity = MobileSecurityConfig(
  tlsPins: TlsPinConfig(
    enabled: false,
    strictMode: false,
    lifecycleState: PinLifecycleState.disabled,
    spkiPinsBase64: [],
  ),
  strictDeviceIntegrity: true,
  blockRootedDevices: true,
  allowRootedInPreviewForQa: false,
);

const _prodConfig = EnvironmentConfig(
  environment: Environment.production,
  apiBaseUrl: 'https://api.lythaus.co/api',
  security: _prodMobileSecurity,
);

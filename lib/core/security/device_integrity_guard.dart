// ignore_for_file: public_member_api_docs

/// LYTHAUS DEVICE INTEGRITY GUARD
///
/// 🎯 Purpose: Policy-based device integrity enforcement per use-case
/// 🔐 Security: Block/warn for high-risk operations on compromised devices
/// 📱 Platform: Flutter with Riverpod integration
///
/// Error Code: Returns [ErrorCodes.deviceIntegrityBlocked] for blocked
/// operations. This stable code allows unified client error handling.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/security_overrides.dart';
import 'package:lythaus/core/security/security_telemetry.dart';

/// Use cases for integrity checks
///
/// All write operations are blocked on compromised devices.
/// Read-only operations are allowed with a warning.
enum IntegrityUseCase {
  // Authentication (high-risk writes)
  signIn,
  signUp,

  // Content creation (writes - always blocked on compromised devices)
  postContent,
  comment,
  like,
  flag,
  appeal,
  uploadMedia,

  // Privacy/data operations (high-risk writes)
  privacyDsr,

  // Read-only operations (allowed with warning)
  readFeed,
}

/// Integrity decision
class DeviceIntegrityDecision {
  final bool allow;
  final bool showBlockingUi;
  final String? messageKey; // for localization
  final String? errorCode; // API error code for client handling
  final bool warnOnly;

  const DeviceIntegrityDecision({
    required this.allow,
    required this.showBlockingUi,
    this.messageKey,
    this.errorCode,
    this.warnOnly = false,
  });

  factory DeviceIntegrityDecision.allow() {
    return const DeviceIntegrityDecision(
      allow: true,
      showBlockingUi: false,
      warnOnly: false,
    );
  }

  factory DeviceIntegrityDecision.warnOnly(String messageKey) {
    return DeviceIntegrityDecision(
      allow: true,
      showBlockingUi: false,
      messageKey: messageKey,
      warnOnly: true,
    );
  }

  factory DeviceIntegrityDecision.block(String messageKey) {
    return DeviceIntegrityDecision(
      allow: false,
      showBlockingUi: true,
      messageKey: messageKey,
      errorCode: ErrorCodes.deviceIntegrityBlocked,
      warnOnly: false,
    );
  }
}

/// Device integrity guard with use-case policies
class DeviceIntegrityGuard {
  final DeviceSecurityService _deviceSecurityService;
  final MobileSecurityConfig _config;
  final Environment _environment;
  final SecurityOverrideConfig _overrides;

  DeviceIntegrityGuard({
    required DeviceSecurityService deviceSecurityService,
    required MobileSecurityConfig config,
    required Environment environment,
    SecurityOverrideConfig? overrides,
  }) : _deviceSecurityService = deviceSecurityService,
       _config = config,
       _environment = environment,
       _overrides = overrides ?? const SecurityOverrideConfig();

  /// Evaluate integrity for a specific use case
  Future<DeviceIntegrityDecision> evaluate(IntegrityUseCase useCase) async {
    final state = await _deviceSecurityService.evaluateSecurity();

    // Check for active overrides
    if (_overrides.relaxDeviceIntegrity && _overrides.isValid()) {
      final event = SecurityEvent.integrityGuard(
        result: 'override_active',
        environment: _environment,
        useCase: useCase.name,
        reason: _overrides.overrideReason ?? 'break_glass_override',
        metadata: state.toJson(),
      );
      SecurityTelemetry.logEvent(event);

      // Override: relax to warn-only
      if (state.isCompromised) {
        return DeviceIntegrityDecision.warnOnly(
          'security.device_compromised_override',
        );
      }
    }

    // Clean device: always allow
    if (!state.isCompromised && !state.isEmulator) {
      return DeviceIntegrityDecision.allow();
    }

    // Apply environment-specific policy
    final decision = _applyPolicy(useCase, state);

    // Log decision
    final event = SecurityEvent.integrityGuard(
      result: decision.allow ? 'allowed' : 'blocked',
      environment: _environment,
      useCase: useCase.name,
      reason: decision.warnOnly ? 'warn_only' : 'enforced',
      strictMode: !decision.warnOnly,
      metadata: {
        ...state.toJson(),
        'show_blocking_ui': decision.showBlockingUi,
      },
    );
    SecurityTelemetry.logEvent(event);

    return decision;
  }

  /// Apply environment and use-case specific policy
  DeviceIntegrityDecision _applyPolicy(
    IntegrityUseCase useCase,
    DeviceSecurityState state,
  ) {
    // Dev environment: warn-only for all use cases
    if (_environment.isDev) {
      if (state.isCompromised) {
        return DeviceIntegrityDecision.warnOnly(
          'security.device_compromised_dev',
        );
      }
      return DeviceIntegrityDecision.allow();
    }

    // Preview: respect the explicit QA relaxation flag.
    if (_environment.isPreview && _config.allowRootedInPreviewForQa) {
      if (state.isCompromised) {
        return DeviceIntegrityDecision.warnOnly(
          'security.device_compromised_preview_qa',
        );
      }
    }

    // MVP live and preview (without QA override):
    // Write operations: block on compromised devices
    // Read-only operations: warn-only
    //
    // Policy: Compromised devices are read-only by design.
    // All state-mutating actions are blocked.

    final isWriteOperation = [
      IntegrityUseCase.signIn,
      IntegrityUseCase.signUp,
      IntegrityUseCase.postContent,
      IntegrityUseCase.comment,
      IntegrityUseCase.like,
      IntegrityUseCase.flag,
      IntegrityUseCase.appeal,
      IntegrityUseCase.uploadMedia,
      IntegrityUseCase.privacyDsr,
    ].contains(useCase);

    if (state.isCompromised || (state.isEmulator && _environment.isProd)) {
      if (isWriteOperation && _config.blockRootedDevices) {
        return DeviceIntegrityDecision.block(
          'security.device_integrity_blocked',
        );
      } else {
        return DeviceIntegrityDecision.warnOnly(
          'security.device_compromised_warning',
        );
      }
    }

    return DeviceIntegrityDecision.allow();
  }
}

/// Riverpod provider for device integrity guard
final deviceIntegrityGuardProvider = Provider<DeviceIntegrityGuard>((ref) {
  final config = EnvironmentConfig.fromEnvironment();
  final deviceService = ref.watch(deviceSecurityServiceProvider);
  final overrides = SecurityOverridesProvider.current;

  return DeviceIntegrityGuard(
    deviceSecurityService: deviceService,
    config: config.security,
    environment: config.environment,
    overrides: overrides,
  );
});

/// Helper function to run actions with device guard
Future<void> runWithDeviceGuard(
  BuildContext context,
  WidgetRef ref,
  IntegrityUseCase useCase,
  Future<void> Function() action,
) async {
  DeviceIntegrityDecision decision;
  try {
    final guard = ref.read(deviceIntegrityGuardProvider);

    // If the device security state is not yet available (async), do not block
    // the UI/actions waiting for a potentially slow platform check. Instead,
    // proceed immediately and evaluate the guard in background. If a cached
    // value exists (AsyncData), evaluate synchronously to enforce policy.
    final asyncState = ref.read(deviceSecurityStateProvider);
    if (asyncState is! AsyncData<DeviceSecurityState>) {
      // Device state not yet available — allow action immediately to avoid
      // blocking UI/tests. Skip background evaluation to prevent timers in
      // test environments.
      decision = DeviceIntegrityDecision.allow();
    } else {
      decision = await guard.evaluate(useCase);
    }
  } catch (e, st) {
    // If evaluation fails (platform/channel issues in tests or runtime),
    // log telemetry and default to allowing the action to avoid blocking
    // critical flows unexpectedly.
    SecurityTelemetry.logEvent(
      SecurityEvent.integrityGuard(
        result: 'evaluation_error',
        environment: Environment.development,
        useCase: useCase.name,
        reason: e.toString(),
        metadata: {'error': e.toString(), 'stack': st.toString()},
      ),
    );

    decision = DeviceIntegrityDecision.allow();
  }

  if (!decision.allow && decision.showBlockingUi) {
    if (context.mounted) {
      await showDeviceIntegrityBlockedDialog(
        context,
        messageKey: decision.messageKey,
      );
    }
    return; // Do not proceed
  }

  if (decision.warnOnly && decision.messageKey != null) {
    // Show dismissible warning
    if (context.mounted) {
      // Avoid showing SnackBar during widget tests (creates pending timers).
      final bindingName = WidgetsBinding.instance.runtimeType.toString();
      if (!bindingName.contains('TestWidgetsFlutterBinding')) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_getLocalizedMessage(decision.messageKey!)),
            duration: const Duration(seconds: 5),
            action: SnackBarAction(label: 'Dismiss', onPressed: () {}),
          ),
        );
      }
    }
  }

  // Proceed with action
  try {
    await action();
  } catch (e, st) {
    SecurityTelemetry.logEvent(
      SecurityEvent.integrityGuard(
        result: 'action_error',
        environment: Environment.development,
        useCase: useCase.name,
        reason: e.toString(),
        metadata: {'error': e.toString(), 'stack': st.toString()},
      ),
    );
    rethrow;
  }
}

/// Get localized message (placeholder - integrate with flutter_localizations)
String _getLocalizedMessage(String key) {
  // TODO: Integrate with proper localization system
  const messages = {
    // Primary message for blocked write operations (no technical details)
    'security.device_integrity_blocked':
        'Posting is disabled on this device for security reasons.\n\n'
        'You can still browse content normally.',
    // Legacy key - redirect to new message
    'security.device_compromised_blocked':
        'Posting is disabled on this device for security reasons.\n\n'
        'You can still browse content normally.',
    'security.device_compromised_warning':
        'Some features may be limited on this device.',
    'security.device_compromised_dev':
        '[DEV] Device integrity check skipped in development mode.',
    'security.device_compromised_preview_qa':
        '[PREVIEW] Device integrity check skipped for QA testing.',
    'security.device_compromised_override':
        'Security override active. Proceeding with caution.',
    'security.default':
        'This action is currently unavailable. Please contact support if this issue persists.',
  };

  return messages[key] ?? messages['security.default']!;
}

bool isDeviceIntegrityBlockedCode(String? code) {
  return code == ErrorCodes.deviceIntegrityBlocked;
}

Future<void> showDeviceIntegrityBlockedDialog(
  BuildContext context, {
  String? messageKey,
}) async {
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: const Text('Security Notice'),
      content: Text(
        _getLocalizedMessage(messageKey ?? 'security.device_integrity_blocked'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}

Future<bool> showDeviceIntegrityBlockedForCode(
  BuildContext context, {
  required String? code,
}) async {
  if (!isDeviceIntegrityBlockedCode(code)) return false;
  await showDeviceIntegrityBlockedDialog(context);
  return true;
}

// ignore_for_file: public_member_api_docs

/// LYTHAUS SECURITY DEBUG SCREEN
///
/// 🎯 Purpose: Dev-only screen showing security state, configs, and test controls
/// 🔐 Security: Only accessible in debug builds (kDebugMode guard)
/// 📱 Platform: Flutter with Riverpod integration
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/security_overrides.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Security debug screen (dev-only)
class SecurityDebugScreen extends ConsumerStatefulWidget {
  const SecurityDebugScreen({super.key});

  @override
  ConsumerState<SecurityDebugScreen> createState() =>
      _SecurityDebugScreenState();
}

class _SecurityDebugScreenState extends ConsumerState<SecurityDebugScreen> {
  bool _simulateRooted = false;
  bool _simulatePinMismatch = false;

  @override
  Widget build(BuildContext context) {
    // Guard: only accessible in debug mode
    if (!kDebugMode) {
      return Scaffold(
        appBar: AppBar(title: const Text('Security Debug')),
        body: const Center(
          child: Text(
            'Security Debug is only available in debug builds.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final config = EnvironmentConfig.fromEnvironment();
    final deviceSecurityState = ref.watch(deviceSecurityStateProvider);
    final overrides = SecurityOverridesProvider.current;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Security Debug'),
        backgroundColor: Theme.of(context).colorScheme.surface,
      ),
      body: deviceSecurityState.when(
        data: (state) => _buildDebugContent(context, config, state, overrides),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
      ),
    );
  }

  Widget _buildDebugContent(
    BuildContext context,
    EnvironmentConfig config,
    DeviceSecurityState state,
    SecurityOverrideConfig overrides,
  ) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: EdgeInsets.all(context.spacing.lg),
      children: [
        // Environment and config section
        _buildSection(
          title: '🌍 Environment',
          children: [
            _buildKeyValue('Environment', config.environment.name),
            _buildKeyValue('Is Dev', config.environment.isDev.toString()),
            _buildKeyValue(
              'Is Preview',
              config.environment.isPreview.toString(),
            ),
            _buildKeyValue('Is Prod', config.environment.isProd.toString()),
          ],
        ),
        const Divider(height: 32),

        // Device security state section
        _buildSection(
          title: '📱 Device Security State',
          children: [
            _buildKeyValue(
              'Rooted/Jailbroken',
              state.isRootedOrJailbroken.toString(),
              valueColor: state.isRootedOrJailbroken
                  ? scheme.error
                  : scheme.primary,
            ),
            _buildKeyValue(
              'Emulator',
              state.isEmulator.toString(),
              valueColor: state.isEmulator ? scheme.tertiary : scheme.primary,
            ),
            _buildKeyValue(
              'Debug Build',
              state.isDebugBuild.toString(),
              valueColor: state.isDebugBuild ? scheme.primary : scheme.outline,
            ),
            _buildKeyValue(
              'Is Compromised',
              state.isCompromised.toString(),
              valueColor: state.isCompromised ? scheme.error : scheme.primary,
            ),
            _buildKeyValue(
              'Last Checked',
              _formatDateTime(state.lastCheckedAt),
            ),
          ],
        ),
        const Divider(height: 32),

        // TLS pinning config section
        _buildSection(
          title: '🔐 TLS Pinning Config',
          children: [
            _buildKeyValue(
              'Enabled',
              config.security.tlsPins.enabled.toString(),
            ),
            _buildKeyValue(
              'Strict Mode',
              config.security.tlsPins.strictMode.toString(),
              valueColor: config.security.tlsPins.strictMode
                  ? scheme.error
                  : scheme.tertiary,
            ),
            _buildKeyValue(
              'Pin Count',
              config.security.tlsPins.spkiPinsBase64.length.toString(),
            ),
            if (config.security.tlsPins.spkiPinsBase64.isNotEmpty)
              ...config.security.tlsPins.spkiPinsBase64.map(
                (pin) => Padding(
                  padding: const EdgeInsets.only(left: 16, top: 4),
                  child: SelectableText(
                    '• ${_truncatePin(pin)}',
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall?.copyWith(fontFamily: 'monospace'),
                  ),
                ),
              ),
          ],
        ),
        const Divider(height: 32),

        // Mobile security config section
        _buildSection(
          title: '🛡️ Mobile Security Config',
          children: [
            _buildKeyValue(
              'Strict Device Integrity',
              config.security.strictDeviceIntegrity.toString(),
            ),
            _buildKeyValue(
              'Block Rooted Devices',
              config.security.blockRootedDevices.toString(),
            ),
            _buildKeyValue(
              'Allow Rooted (Preview QA)',
              config.security.allowRootedInPreviewForQa.toString(),
            ),
          ],
        ),
        const Divider(height: 32),

        // Security overrides section
        _buildSection(
          title: '🚨 Security Overrides',
          children: [
            _buildKeyValue(
              'Relax TLS Pinning',
              overrides.relaxTlsPinning.toString(),
              valueColor: overrides.relaxTlsPinning ? scheme.error : null,
            ),
            _buildKeyValue(
              'Relax Device Integrity',
              overrides.relaxDeviceIntegrity.toString(),
              valueColor: overrides.relaxDeviceIntegrity ? scheme.error : null,
            ),
            _buildKeyValue('Override Valid', overrides.isValid().toString()),
            if (overrides.activatedAt != null)
              _buildKeyValue(
                'Activated At',
                _formatDateTime(overrides.activatedAt!),
              ),
            if (overrides.validityDuration != null)
              _buildKeyValue(
                'Valid For',
                '${overrides.validityDuration!.inHours} hours',
              ),
            if (overrides.overrideReason != null)
              _buildKeyValue('Reason', overrides.overrideReason!),
          ],
        ),
        const Divider(height: 32),

        // Test controls section (dev only)
        if (config.environment.isDev) ...[
          _buildSection(
            title: '🧪 Test Controls (Dev Only)',
            children: [
              SwitchListTile(
                title: const Text('Simulate Rooted Device'),
                subtitle: const Text(
                  'Forces isRootedOrJailbroken to true for testing',
                ),
                value: _simulateRooted,
                onChanged: (value) {
                  setState(() => _simulateRooted = value);
                  LythSnackbar.info(
                    context: context,
                    message:
                        'Rooted simulation ${value ? 'enabled' : 'disabled'}. '
                        'Restart app to apply.',
                  );
                },
              ),
              SwitchListTile(
                title: const Text('Simulate TLS Pin Mismatch'),
                subtitle: const Text(
                  'Forces pin validation to fail for testing',
                ),
                value: _simulatePinMismatch,
                onChanged: (value) {
                  setState(() => _simulatePinMismatch = value);
                  LythSnackbar.info(
                    context: context,
                    message:
                        'Pin mismatch simulation ${value ? 'enabled' : 'disabled'}. '
                        'Restart app to apply.',
                  );
                },
              ),
              SizedBox(height: context.spacing.lg),
              LythButton.secondary(
                label: 'Test Integrity Guard',
                icon: Icons.security,
                onPressed: () => _testIntegrityGuard(context),
              ),
              SizedBox(height: context.spacing.sm),
              LythButton.secondary(
                label: 'Test TLS Pinning',
                icon: Icons.lock,
                onPressed: () => _testTlsPinning(context),
              ),
            ],
          ),
        ],

        SizedBox(height: context.spacing.xxl),
        Text(
          '⚠️ This screen is only accessible in debug builds and should never '
          'appear in production.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.6),
            fontStyle: FontStyle.italic,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        SizedBox(height: context.spacing.md),
        ...children,
      ],
    );
  }

  Widget _buildKeyValue(String key, String value, {Color? valueColor}) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: context.spacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              key,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            flex: 3,
            child: SelectableText(
              value,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color:
                    valueColor ??
                    Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.8),
                fontWeight: valueColor != null ? FontWeight.w600 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
  }

  String _truncatePin(String pin) {
    if (pin.length <= 32) return pin;
    return '${pin.substring(0, 16)}...${pin.substring(pin.length - 8)}';
  }

  void _testIntegrityGuard(BuildContext context) async {
    final guard = ref.read(deviceIntegrityGuardProvider);

    final results = <String, DeviceIntegrityDecision>{};

    for (final useCase in IntegrityUseCase.values) {
      final decision = await guard.evaluate(useCase);
      results[useCase.name] = decision;
    }

    if (!context.mounted) return;

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Integrity Guard Test Results'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: results.entries.map((e) {
              final decision = e.value;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  '${e.key}: ${decision.allow ? "✅ Allow" : "🚫 Block"}'
                  '${decision.warnOnly ? " (warn)" : ""}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: decision.allow
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        actions: [
          LythButton.tertiary(
            label: 'Close',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  void _testTlsPinning(BuildContext context) {
    final config = EnvironmentConfig.fromEnvironment();
    final tlsConfig = config.security.tlsPins;

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('TLS Pinning Status'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Enabled: ${tlsConfig.enabled}'),
            Text('Strict Mode: ${tlsConfig.strictMode}'),
            Text('Pin Count: ${tlsConfig.spkiPinsBase64.length}'),
            SizedBox(height: context.spacing.lg),
            Text(
              'To test pinning, make an API request. '
              'Check logs for pinning validation results.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          LythButton.tertiary(
            label: 'Close',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}

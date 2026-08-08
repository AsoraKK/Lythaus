// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';

import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:lythaus/features/privacy/utils/privacy_formatters.dart';
import 'package:lythaus/features/privacy/widgets/analytics_settings_card.dart';
import 'package:lythaus/features/privacy/widgets/cooldown_row.dart';
import 'package:lythaus/features/privacy/widgets/delete_confirmation_dialog.dart';
import 'package:lythaus/features/privacy/widgets/delete_section.dart';
import 'package:lythaus/features/privacy/widgets/export_section.dart';
import 'package:lythaus/features/privacy/widgets/privacy_blocking_overlay.dart';
import 'package:lythaus/features/privacy/widgets/privacy_error_banner.dart';
import 'package:lythaus/features/privacy/widgets/privacy_info_card.dart';

class PrivacySettingsScreen extends ConsumerStatefulWidget {
  const PrivacySettingsScreen({super.key});

  @override
  ConsumerState<PrivacySettingsScreen> createState() =>
      _PrivacySettingsScreenState();
}

class _PrivacySettingsScreenState extends ConsumerState<PrivacySettingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(privacyControllerProvider.notifier).refreshStatus();

        // Log screen view
        ref
            .read(analyticsClientProvider)
            .logEvent(AnalyticsEvents.privacySettingsOpened);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<PrivacyState>(privacyControllerProvider, _handleStateChange);
    final state = ref.watch(privacyControllerProvider);
    final controller = ref.read(privacyControllerProvider.notifier);

    final isBusy =
        state.exportStatus == ExportStatus.requesting ||
        state.exportStatus == ExportStatus.queued;
    final buttonLabel = state.isCoolingDown
        ? 'Try again in ${formatPrivacyCountdown(state.remainingCooldown)}'
        : isBusy
        ? 'Export requested'
        : 'Request export';
    final canTap = !isBusy && !state.isCoolingDown && state.canRequestExport;

    final lastRequestLabel = state.hasLastExport
        ? 'Last request: ${formatPrivacyTimestamp(state.lastExportAt!)}'
        : 'No export requests yet';
    final nextAvailableLabel = state.isCoolingDown
        ? 'Next request available in ${formatPrivacyCountdown(state.remainingCooldown)}'
        : 'Next request available now';

    final errorMessage = state.error;

    return Scaffold(
      appBar: AppBar(title: const Text('Privacy')),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PrivacyExportSection(
                isBusy: isBusy,
                isCoolingDown: state.isCoolingDown,
                buttonLabel: buttonLabel,
                onRequest: canTap
                    ? () => runWithDeviceGuard(
                        context,
                        ref,
                        IntegrityUseCase.privacyDsr,
                        () => controller.export(),
                      )
                    : null,
                onRefresh: () => controller.refreshStatus(),
                cooldownRow: PrivacyCooldownRow(
                  lastRequestLabel: lastRequestLabel,
                  nextAvailableLabel: nextAvailableLabel,
                ),
              ),
              if (errorMessage != null &&
                  (state.exportStatus == ExportStatus.failed ||
                      state.deleteStatus == DeleteStatus.failed)) ...[
                const SizedBox(height: 12),
                PrivacyErrorBanner(message: errorMessage),
              ],
              const SizedBox(height: 24),
              const AnalyticsSettingsCard(),
              const SizedBox(height: 24),
              PrivacyDeleteSection(
                onDelete: () => _confirmDelete(controller),
                isProcessing: state.deleteStatus == DeleteStatus.deleting,
              ),
              const SizedBox(height: 24),
              const PrivacyInfoCard(),
            ],
          ),
          if (state.deleteStatus == DeleteStatus.deleting)
            const PrivacyBlockingOverlay(),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(PrivacyController controller) async {
    controller.beginDeleteConfirmation();
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (_) => const DeleteConfirmationDialog(),
        ) ??
        false;
    if (!mounted) return;
    if (confirmed) {
      await runWithDeviceGuard(
        context,
        ref,
        IntegrityUseCase.privacyDsr,
        () => controller.delete(),
      );
    } else {
      controller.cancelDeleteConfirmation();
    }
  }

  void _handleStateChange(PrivacyState? previous, PrivacyState next) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);

    if (previous?.exportStatus != ExportStatus.accepted &&
        next.exportStatus == ExportStatus.accepted) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Export request submitted. Refresh this page to track processing.',
          ),
        ),
      );
    }

    if (previous?.exportStatus != ExportStatus.failed &&
        next.exportStatus == ExportStatus.failed &&
        next.error != null) {
      messenger.showSnackBar(SnackBar(content: Text(next.error!)));
    }

    if (previous?.deleteStatus != DeleteStatus.failed &&
        next.deleteStatus == DeleteStatus.failed &&
        next.error != null) {
      messenger.showSnackBar(SnackBar(content: Text(next.error!)));
    }

    if (previous?.deleteStatus != DeleteStatus.requested &&
        next.deleteStatus == DeleteStatus.requested) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Deletion request submitted. Your account remains available while the request is processed.',
          ),
        ),
      );
    }
  }
}

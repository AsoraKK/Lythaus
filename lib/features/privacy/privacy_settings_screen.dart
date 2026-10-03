// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:file_selector/file_selector.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/ui/components/reading_pane.dart';

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

    if (state.isGuest) {
      return Scaffold(
        appBar: AppBar(title: const Text('Privacy')),
        body: SignInRequired(
          message:
              state.error ??
              'Sign in to manage your data and privacy requests.',
          returnTo:
              GoRouter.maybeOf(
                context,
              )?.routeInformationProvider.value.uri.toString() ??
              '/settings/privacy',
        ),
      );
    }
    final isBusy = state.exportStatus == ExportStatus.requesting;
    final buttonLabel = state.isCoolingDown
        ? 'Try again in ${formatPrivacyCountdown(state.remainingCooldown)}'
        : isBusy
        ? 'Export requested'
        : 'Request export';
    final canTap = !isBusy && !state.isCoolingDown && state.canRequestExport;

    final lastRequestLabel = state.hasLastExport
        ? 'Last request: ${formatPrivacyTimestamp(state.lastExportAt!)}'
        : state.exportStatus == ExportStatus.idle
        ? 'No export requests yet'
        : 'Refresh status to check your requests';
    final nextAvailableLabel = state.isCoolingDown
        ? 'Next request available in ${formatPrivacyCountdown(state.remainingCooldown)}'
        : state.canRequestExport
        ? 'Next request available now'
        : 'Refresh status to check when another request is available';

    final errorMessage = state.error;

    return ReadingPane(
      child: Scaffold(
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
                  statusLabel: _exportLabel(state.exportStatus),
                  onDownload: state.canDownload
                      ? () => _download(controller)
                      : null,
                  downloading: state.downloading,
                  completedLabel: state.completedAt == null
                      ? null
                      : 'Completed: ${formatPrivacyTimestamp(state.completedAt!)}',
                ),
                if (errorMessage != null) ...[
                  const SizedBox(height: 12),
                  PrivacyErrorBanner(message: errorMessage),
                ],
                const SizedBox(height: 24),
                const AnalyticsSettingsCard(),
                const SizedBox(height: 24),
                PrivacyDeleteSection(
                  onDelete: state.canRequestDeletion
                      ? () => _confirmDelete(controller)
                      : null,
                  isProcessing: state.deleteStatus == DeleteStatus.deleting,
                  statusLabel: _deleteLabel(state.deleteStatus),
                ),
                const SizedBox(height: 24),
                const PrivacyInfoCard(),
              ],
            ),
            if (state.deleteStatus == DeleteStatus.deleting)
              const PrivacyBlockingOverlay(),
          ],
        ),
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
    if (!mounted || !controller.isCurrentSession) return;
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

  Future<void> _download(PrivacyController controller) async {
    final id = controller.exportRequestId;
    final bytes = await controller.download();
    if (bytes == null || !mounted || !controller.isCurrentSession) return;
    final filename =
        'lythaus-export-${id!.replaceAll(RegExp(r'[^A-Za-z0-9-]'), '_')}.json';
    final file = XFile.fromData(
      bytes,
      name: filename,
      mimeType: 'application/json',
    );
    try {
      if (kIsWeb) {
        await file.saveTo(filename);
      } else if (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS) {
        final box = context.findRenderObject() as RenderBox?;
        await SharePlus.instance.share(
          ShareParams(
            files: [file],
            fileNameOverrides: [filename],
            sharePositionOrigin: box == null
                ? null
                : box.localToGlobal(Offset.zero) & box.size,
          ),
        );
      } else {
        final destination = await getSaveLocation(suggestedName: filename);
        if (destination != null && mounted && controller.isCurrentSession) {
          await file.saveTo(destination.path);
        }
      }
    } catch (_) {
      if (mounted && controller.isCurrentSession) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('The export could not be saved. Please try again.'),
          ),
        );
      }
    }
  }

  String _exportLabel(ExportStatus status) => switch (status) {
    ExportStatus.idle => 'No export request is active.',
    ExportStatus.requesting => 'Submitting your export request…',
    ExportStatus.received || ExportStatus.accepted =>
      'Export request received. Processing has not finished.',
    ExportStatus.processing ||
    ExportStatus.queued => 'Your export is being prepared.',
    ExportStatus.blocked =>
      'Your export is on hold. Refresh status for updates.',
    ExportStatus.completed =>
      'Export completed. Download while the secure export remains available.',
    ExportStatus.failed =>
      'The last export request failed. Refresh status before requesting another.',
    ExportStatus.unknown || ExportStatus.coolingDown =>
      'Export status has not been confirmed. Refresh to check.',
  };

  String _deleteLabel(DeleteStatus status) => switch (status) {
    DeleteStatus.requested =>
      'Deletion request received. Your account remains available while processing is pending.',
    DeleteStatus.processing => 'Your deletion request is being processed.',
    DeleteStatus.blocked =>
      'Deletion is on hold while required retention or other checks are reviewed.',
    DeleteStatus.completed =>
      'The server reports your deletion request completed.',
    DeleteStatus.failed =>
      'The last deletion request failed. Refresh status before trying again.',
    DeleteStatus.unknown =>
      'Refresh status to check previous deletion requests.',
    _ => '',
  };

  void _handleStateChange(PrivacyState? previous, PrivacyState next) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);

    if (previous?.exportStatus == ExportStatus.requesting &&
        next.exportStatus == ExportStatus.received) {
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

// ignore_for_file: public_member_api_docs

/// LYTHAUS CREATE POST SCREEN
///
/// 🎯 Purpose: UI for creating new posts
/// 🏗️ Architecture: Presentation layer - handles user interaction
/// 🔐 Requires authentication to submit
/// 📱 Platform: Flutter Material Design 3
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/services/appeal_provider.dart';

/// Screen for creating a new post
class CreatePostScreen extends ConsumerStatefulWidget {
  const CreatePostScreen({super.key});

  @override
  ConsumerState<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends ConsumerState<CreatePostScreen> {
  static const String _policyReminderMessage =
      'Choose Human-authored or AI-assisted before posting.\n'
      'AI-generated public content is not allowed.\n'
      'AI-assisted public text is limited to 249 user-perceived characters.\n'
      'Disclosure conflicts may be placed Under review.\n'
      'Appeal outcomes are recorded by Lythaus.\n'
      'This is an invite-only Alpha.';

  final _textController = TextEditingController();
  final _focusNode = FocusNode();
  bool _policyReminderShown = false;
  final GlobalKey<TooltipState> _policyTooltipKey = GlobalKey<TooltipState>();

  @override
  void initState() {
    super.initState();
    _textController.text = ref.read(postCreationProvider).text;
    // Request focus when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(postCreationProvider);
    final inputEpoch = ref.watch(
      contentMutationRegistryProvider.select(
        (registry) => registry.sessionEpoch,
      ),
    );
    final canCreate = ref.watch(canCreatePostProvider);
    final theme = Theme.of(context);
    final isAssisted = state.aiLabel == 'assisted';
    final canEdit =
        canCreate &&
        !state.isRestoring &&
        !state.isSubmitting &&
        state.errorResult?.outcomeUncertain != true;
    final characterCount = isAssisted
        ? state.userPerceivedTextLength
        : state.text.length;
    final characterLimit = isAssisted
        ? aiAssistedPublicTextMaxGraphemes
        : postTextMaxLength;
    final remainingCharacters = (characterLimit - characterCount).clamp(
      0,
      characterLimit,
    );

    // Listen for successful post creation
    ref.listen<PostCreationState>(postCreationProvider, (previous, next) {
      if (_textController.text != next.text) {
        _textController.value = TextEditingValue(
          text: next.text,
          selection: TextSelection.collapsed(offset: next.text.length),
        );
      }
      final errorCode = next.errorResult?.code;
      if (errorCode != null &&
          errorCode != previous?.errorResult?.code &&
          isDeviceIntegrityBlockedCode(errorCode)) {
        showDeviceIntegrityBlockedDialog(context);
        ref.read(postCreationProvider.notifier).clearError();
        return;
      }
      if (next.isSuccess && previous?.isSuccess != true) {
        _onPostCreated(context, next.successResult!);
      }
    });

    return PopScope(
      canPop: !state.isSubmitting && (state.text.isEmpty || state.isSuccess),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleClose(context);
      },
      child: ReadingPane(
        child: Scaffold(
          appBar: AppBar(
            title: Text('Create Post', style: context.textTheme.titleLarge),
            leading: IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Close composer',
              onPressed: () => _handleClose(context),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Tooltip(
                  key: _policyTooltipKey,
                  message: _policyReminderMessage,
                  triggerMode: TooltipTriggerMode.manual,
                  showDuration: const Duration(seconds: 6),
                  child: FilledButton(
                    onPressed:
                        state.isSubmitting ||
                            state.isRestoring ||
                            !state.isValid ||
                            !canCreate
                        ? null
                        : _handleSubmit,
                    child: Semantics(
                      label: state.isSubmitting ? 'Post' : null,
                      value: state.isSubmitting ? 'In progress' : null,
                      liveRegion: state.isSubmitting,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Visibility(
                            visible: !state.isSubmitting,
                            maintainSize: true,
                            maintainAnimation: true,
                            maintainState: true,
                            child: const Text('Post'),
                          ),
                          if (state.isSubmitting)
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                value: context.disableAnimations ? 0.75 : null,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          body: GestureDetector(
            onTap: () => _focusNode.requestFocus(),
            child: Column(
              children: [
                // Error banner
                if (state.isBlocked)
                  _ContentBlockedBanner(
                    result: state.blockedResult!,
                    onAppeal:
                        state.blockedResult!.appealEligible &&
                            (state.blockedResult!.appealCaseId?.isNotEmpty ??
                                false)
                        ? () => _submitBlockedAppeal(
                            state.blockedResult!.appealCaseId!,
                          )
                        : null,
                  ),
                if (state.isLimitExceeded)
                  _LimitExceededBanner(result: state.limitExceededResult!),
                if (state.hasError &&
                    state.errorResult?.code !=
                        ErrorCodes.deviceIntegrityBlocked)
                  _ErrorBanner(result: state.errorResult!),

                // Main content
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Auth required message
                          if (!canCreate) _AuthRequiredCard(theme: theme),
                          if (state.isRestoring) const Text('Restoring draft…'),
                          if (state.draftStatus != null)
                            Text(state.draftStatus!),

                          // Text input
                          const SizedBox(height: 12),
                          TextField(
                            key: ValueKey('post-create-input:$inputEpoch'),
                            controller: _textController,
                            focusNode: _focusNode,
                            minLines: 8,
                            maxLines: 12,
                            textAlignVertical: TextAlignVertical.top,
                            enabled: canEdit,
                            style: context.textTheme.bodyLarge,
                            decoration: InputDecoration(
                              labelText: 'Your post',
                              floatingLabelBehavior:
                                  FloatingLabelBehavior.always,
                              hintText: "What's on your mind?",
                              hintStyle: context.textTheme.bodyMedium?.copyWith(
                                color: context.colorScheme.onSurfaceVariant,
                              ),
                              border: InputBorder.none,
                              errorText: state.validationError,
                              counterText: isAssisted
                                  ? '$characterCount/$characterLimit '
                                        'user-perceived characters'
                                  : '$characterCount/$characterLimit',
                              semanticCounterText: isAssisted
                                  ? '$characterCount of $characterLimit '
                                        'user-perceived characters used'
                                  : '$characterCount of $characterLimit '
                                        'characters used',
                            ),
                            onChanged: (value) {
                              ref
                                  .read(postCreationProvider.notifier)
                                  .updateText(value);
                            },
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'AI disclosure',
                            style: context.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Required. AI-generated public content is not allowed. '
                            'AI-assisted public text is limited to '
                            '$aiAssistedPublicTextMaxGraphemes user-perceived characters.',
                            style: context.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              ChoiceChip(
                                label: Text(
                                  'Human-authored',
                                  style: context.textTheme.bodySmall,
                                ),
                                selected: state.aiLabel == 'human',
                                onSelected: canEdit
                                    ? (_) => ref
                                          .read(postCreationProvider.notifier)
                                          .setAiLabel('human')
                                    : null,
                              ),
                              ChoiceChip(
                                label: Text(
                                  'AI-assisted',
                                  style: context.textTheme.bodySmall,
                                ),
                                selected: state.aiLabel == 'assisted',
                                onSelected: canEdit
                                    ? (_) => ref
                                          .read(postCreationProvider.notifier)
                                          .setAiLabel('assisted')
                                    : null,
                              ),
                            ],
                          ),
                          if (isAssisted)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                '$characterCount of '
                                '$aiAssistedPublicTextMaxGraphemes user-perceived '
                                'characters used for AI-assisted public text.',
                                style: context.textTheme.bodySmall?.copyWith(
                                  color:
                                      characterCount >
                                          aiAssistedPublicTextMaxGraphemes
                                      ? theme.colorScheme.error
                                      : theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                          const SizedBox(height: 12),
                          Text(
                            'Challenge Mode: Proof of origin (optional)',
                            style: context.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Optional. No penalty if not provided.',
                            style: context.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _ProofTile(
                            title: 'Capture metadata hash',
                            subtitle: 'Device-captured media fingerprint',
                            value: state.proofSignals.captureMetadataHash,
                            onAdd: () => _editProofValue(
                              title: 'Capture metadata hash',
                              helper:
                                  'Paste a hash generated from device capture metadata.',
                              currentValue:
                                  state.proofSignals.captureMetadataHash,
                              onSave: ref
                                  .read(postCreationProvider.notifier)
                                  .updateCaptureMetadataHash,
                            ),
                            onViewDetails: () => _showProofDetails(
                              kind: _ProofTileKind.captureHash,
                              value: state.proofSignals.captureMetadataHash!,
                              onEdit: () => _editProofValue(
                                title: 'Capture metadata hash',
                                helper:
                                    'Paste a hash generated from device capture metadata.',
                                currentValue:
                                    state.proofSignals.captureMetadataHash,
                                onSave: ref
                                    .read(postCreationProvider.notifier)
                                    .updateCaptureMetadataHash,
                              ),
                            ),
                          ),
                          _ProofTile(
                            title: 'Edit history hash',
                            subtitle: 'Edit sequence fingerprint',
                            value: state.proofSignals.editHistoryHash,
                            onAdd: () => _editProofValue(
                              title: 'Edit history hash',
                              helper:
                                  'Paste a hash generated from edit history.',
                              currentValue: state.proofSignals.editHistoryHash,
                              onSave: ref
                                  .read(postCreationProvider.notifier)
                                  .updateEditHistoryHash,
                            ),
                            onViewDetails: () => _showProofDetails(
                              kind: _ProofTileKind.editHash,
                              value: state.proofSignals.editHistoryHash!,
                              onEdit: () => _editProofValue(
                                title: 'Edit history hash',
                                helper:
                                    'Paste a hash generated from edit history.',
                                currentValue:
                                    state.proofSignals.editHistoryHash,
                                onSave: ref
                                    .read(postCreationProvider.notifier)
                                    .updateEditHistoryHash,
                              ),
                            ),
                          ),
                          _ProofTile(
                            title: 'Source attestation',
                            subtitle: 'Source link or signed statement URL',
                            value: state.proofSignals.sourceAttestationUrl,
                            onAdd: () => _editProofValue(
                              title: 'Source attestation URL',
                              helper:
                                  'Provide a source URL that supports this post.',
                              currentValue:
                                  state.proofSignals.sourceAttestationUrl,
                              onSave: ref
                                  .read(postCreationProvider.notifier)
                                  .updateSourceAttestationUrl,
                            ),
                            onViewDetails: () => _showProofDetails(
                              kind: _ProofTileKind.sourceAttestation,
                              value: state.proofSignals.sourceAttestationUrl!,
                              onEdit: () => _editProofValue(
                                title: 'Source attestation URL',
                                helper:
                                    'Provide a source URL that supports this post.',
                                currentValue:
                                    state.proofSignals.sourceAttestationUrl,
                                onSave: ref
                                    .read(postCreationProvider.notifier)
                                    .updateSourceAttestationUrl,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // Bottom toolbar
                SafeArea(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(color: theme.dividerColor, width: 1),
                      ),
                    ),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        '$remainingCharacters '
                        '${isAssisted ? 'user-perceived characters' : 'characters'} '
                        'remaining',
                        style: context.textTheme.bodySmall?.copyWith(
                          color: characterCount > characterLimit * 0.9
                              ? theme.colorScheme.error
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _handleSubmit() async {
    if (!_policyReminderShown) {
      _policyReminderShown = true;
      _policyTooltipKey.currentState?.ensureTooltipVisible();
    }

    final user = ref.read(currentUserProvider);
    ref
        .read(analyticsEventTrackerProvider)
        .logEventOnce(
          ref.read(analyticsClientProvider),
          AnalyticsEvents.firstPostAttempt,
          userId: user?.id,
        );

    await runWithDeviceGuard(
      context,
      ref,
      IntegrityUseCase.postContent,
      () async {
        final success = await ref.read(postCreationProvider.notifier).submit();
        if (!success && mounted) {
          // Error is shown via the banner
        }
      },
    );
  }

  void _handleClose(BuildContext context) {
    final state = ref.read(postCreationProvider);
    if (state.isSubmitting) return;
    if (state.errorResult?.outcomeUncertain == true) {
      Navigator.of(context).pop();
      return;
    }
    if (state.text.isNotEmpty && !state.isSuccess) {
      _showDiscardDialog(context);
    } else {
      ref.read(postCreationProvider.notifier).reset();
      Navigator.of(context).pop();
    }
  }

  void _showDiscardDialog(BuildContext context) {
    final registry = ref.read(contentMutationRegistryProvider);
    final epoch = registry.sessionEpoch;
    final actor = ref.read(currentUserProvider)?.id ?? 'session';
    var saving = false;
    String? error;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => PopScope(
          canPop: !saving,
          child: AlertDialog(
            scrollable: true,
            title: Text(
              'Discard post?',
              style: context.textTheme.headlineSmall,
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Your post will be lost if you close this screen.',
                  style: context.textTheme.bodyMedium,
                ),
                if (error != null)
                  Text(
                    error!,
                    style: TextStyle(color: context.colorScheme.error),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: saving
                    ? null
                    : () => Navigator.of(dialogContext).pop(),
                child: const Text('Keep editing'),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: context.colorScheme.error,
                  foregroundColor: context.colorScheme.onError,
                ),
                onPressed: saving
                    ? null
                    : () async {
                        if (epoch != registry.sessionEpoch) {
                          updateDialog(
                            () => error =
                                'Your session changed. Reopen your draft.',
                          );
                          return;
                        }
                        updateDialog(() {
                          saving = true;
                          error = null;
                        });
                        final cleared = await registry.saveDraft(
                          'post-create:$actor',
                          null,
                        );
                        if (!mounted || !dialogContext.mounted) return;
                        if (!cleared || epoch != registry.sessionEpoch) {
                          updateDialog(() {
                            saving = false;
                            error =
                                'Draft could not be discarded. Keep editing and try again.';
                          });
                          return;
                        }
                        ref.read(postCreationProvider.notifier).reset();
                        Navigator.of(dialogContext).pop();
                        Navigator.of(context).pop();
                      },
                child: Text(saving ? 'Discarding…' : 'Discard'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _onPostCreated(BuildContext context, CreatePostSuccess result) {
    final user = ref.read(currentUserProvider);
    if (user != null) {
      ref
          .read(analyticsEventTrackerProvider)
          .logEventOnce(
            ref.read(analyticsClientProvider),
            AnalyticsEvents.firstPost,
            userId: user.id,
          );
    }
    LythSnackbar.success(
      context: context,
      message: result.post.moderationState == 'allowed'
          ? 'Post created successfully!'
          : 'Post submitted. Publication checks are pending.',
    );

    // Reset and close
    ref.read(postCreationProvider.notifier).reset();
    Navigator.of(context).pop(result.post);
  }

  Future<void> _editProofValue({
    required String title,
    required String helper,
    required String? currentValue,
    required void Function(String?) onSave,
  }) async {
    final controller = TextEditingController(text: currentValue ?? '');
    final next = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: Text(title, style: context.textTheme.headlineSmall),
        content: TextField(
          controller: controller,
          minLines: 1,
          maxLines: 3,
          decoration: InputDecoration(hintText: helper, helperText: 'Optional'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (!mounted) {
      return;
    }
    onSave(next == null || next.isEmpty ? null : next);
  }

  Future<void> _showProofDetails({
    required _ProofTileKind kind,
    required String value,
    required VoidCallback onEdit,
  }) async {
    final trimmed = value.trim();
    final hashPreview = _truncateProofValue(trimmed);
    final domain = _extractDomain(trimmed);
    final isHash =
        kind == _ProofTileKind.captureHash || kind == _ProofTileKind.editHash;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                kind.title,
                style: context.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Status: Provided',
                style: context.textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.tertiary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              if (isHash) ...[
                Text(
                  'Hash preview',
                  style: context.textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 4),
                SelectableText(
                  hashPreview,
                  style: context.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ] else ...[
                Text(
                  'Domain: $domain',
                  style: context.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                SelectableText(
                  trimmed,
                  style: context.textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: trimmed));
                      if (!sheetContext.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(sheetContext).showSnackBar(
                        SnackBar(
                          content: Text(
                            isHash ? 'Hash copied' : 'Link copied',
                            style: sheetContext.textTheme.bodyMedium,
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy_outlined, size: 16),
                    label: Text(isHash ? 'Copy hash' : 'Copy link'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      onEdit();
                    },
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Edit'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _truncateProofValue(String value) {
    if (value.length <= 16) {
      return value;
    }
    return '${value.substring(0, 8)}...${value.substring(value.length - 8)}';
  }

  String _extractDomain(String value) {
    final uri = Uri.tryParse(value);
    final host = uri?.host.trim();
    if (host == null || host.isEmpty) {
      return 'Unknown domain';
    }
    return host;
  }

  Future<void> _submitBlockedAppeal(String caseId) async {
    final controller = TextEditingController();
    final statement = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: Text(
          'Request an appeal review',
          style: context.textTheme.headlineSmall,
        ),
        content: TextField(
          controller: controller,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText:
                'Briefly explain why this moderation case should be reviewed.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (!mounted) return;
    if (statement == null || statement.trim().length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Please provide at least 10 characters for your appeal.',
            style: context.textTheme.bodyMedium,
          ),
        ),
      );
      return;
    }

    final success = await ref.read(appealProvider).submit(caseId, statement);
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Appeal submitted for independent trained-reviewer and '
                    'adjudicator review. We will notify you when there is an update.'
              : 'Failed to submit appeal. Please try again.',
          style: context.textTheme.bodyMedium,
        ),
      ),
    );
  }
}

enum _ProofTileKind { captureHash, editHash, sourceAttestation }

extension on _ProofTileKind {
  String get title {
    switch (this) {
      case _ProofTileKind.captureHash:
        return 'Capture metadata hash';
      case _ProofTileKind.editHash:
        return 'Edit history hash';
      case _ProofTileKind.sourceAttestation:
        return 'Source attestation';
    }
  }
}

class _ProofTile extends StatelessWidget {
  const _ProofTile({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onAdd,
    required this.onViewDetails,
  });

  final String title;
  final String subtitle;
  final String? value;
  final VoidCallback onAdd;
  final VoidCallback onViewDetails;

  @override
  Widget build(BuildContext context) {
    final provided = value != null && value!.trim().isNotEmpty;
    final safePreview = provided ? _preview(value!) : null;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        title: Text(title, style: context.textTheme.titleSmall),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(subtitle, style: context.textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(
              provided ? 'Provided' : 'Not provided',
              style: context.textTheme.bodySmall?.copyWith(
                color: provided
                    ? Theme.of(context).colorScheme.tertiary
                    : Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (safePreview != null)
              Text(
                safePreview,
                style: context.textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ),
        trailing: TextButton(
          onPressed: provided ? onViewDetails : onAdd,
          child: Text(provided ? 'View details' : 'Add'),
        ),
      ),
    );
  }

  String _preview(String raw) {
    final trimmed = raw.trim();
    if (trimmed.length <= 16) {
      return trimmed;
    }
    return '${trimmed.substring(0, 8)}...${trimmed.substring(trimmed.length - 8)}';
  }
}

/// Banner shown when content is blocked by moderation
class _ContentBlockedBanner extends StatelessWidget {
  final CreatePostBlocked result;
  final VoidCallback? onAppeal;

  const _ContentBlockedBanner({required this.result, this.onAppeal});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: theme.colorScheme.errorContainer,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.block, color: theme.colorScheme.error, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Content Blocked',
                  style: context.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.error,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(result.message, style: context.textTheme.bodyMedium),
          if (result.categories.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: result.categories.map((category) {
                return Chip(
                  label: Text(category, style: context.textTheme.bodySmall),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: theme.colorScheme.errorContainer,
                );
              }).toList(),
            ),
          ],
          if (onAppeal != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: onAppeal,
              icon: const Icon(Icons.gavel_outlined),
              label: const Text('Appeal'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Banner shown when daily post limit is exceeded
class _LimitExceededBanner extends StatelessWidget {
  final CreatePostLimitExceeded result;

  const _LimitExceededBanner({required this.result});

  @override
  Widget build(BuildContext context) {
    final hours = result.retryAfter.inHours;
    final minutes = result.retryAfter.inMinutes % 60;

    String retryText;
    if (hours > 0) {
      retryText = 'Try again in ${hours}h ${minutes}m';
    } else {
      retryText = 'Try again in ${minutes}m';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: context.semanticColors['warningSurface'],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.timer_outlined,
                color: context.semanticColors['warning'],
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Daily Limit Reached',
                  style: context.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: context.semanticColors['warning'],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'You\'ve reached your daily limit of ${result.limit} posts '
            '(${result.tier} tier). $retryText.',
            style: context.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

/// Banner shown for generic errors
class _ErrorBanner extends StatelessWidget {
  final CreatePostError result;

  const _ErrorBanner({required this.result});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: theme.colorScheme.errorContainer,
      child: Row(
        children: [
          Icon(Icons.error_outline, color: theme.colorScheme.error, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              result.message,
              style: context.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Card shown when user is not authenticated
class _AuthRequiredCard extends StatelessWidget {
  final ThemeData theme;

  const _AuthRequiredCard({required this.theme});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.lock_outline, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Please sign in to create a post.',
                style: context.textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Floating action button for creating posts
class CreatePostFAB extends ConsumerWidget {
  const CreatePostFAB({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canCreate = ref.watch(canCreatePostProvider);

    return FloatingActionButton.extended(
      onPressed: () => _openCreatePost(context, canCreate),
      icon: const Icon(Icons.edit),
      label: const Text('Post'),
      tooltip: canCreate ? 'Create a new post' : 'Sign in to create a post',
    );
  }

  void _openCreatePost(BuildContext context, bool canCreate) {
    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Please sign in to create a post',
            style: context.textTheme.bodyMedium,
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const CreatePostScreen(),
        fullscreenDialog: true,
      ),
    );
  }
}

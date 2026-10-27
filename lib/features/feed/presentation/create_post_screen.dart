// ignore_for_file: public_member_api_docs

/// LYTHAUS CREATE POST SCREEN
///
/// 🎯 Purpose: UI for creating new posts
/// 🏗️ Architecture: Presentation layer - handles user interaction
/// 🔐 Requires authentication to submit
/// 📱 Platform: Flutter Material Design 3
library;

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
import 'package:lythaus/features/media/application/private_image_upload.dart';
import 'package:lythaus/features/media/presentation/private_image_upload_card.dart';

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
  Object? _memberDialogOwner;
  Object? _appealDialogOwner;
  Object? _appealDialogRouteOwner;
  NavigatorState? _appealDialogNavigator;
  Route<dynamic>? _appealDialogRoute;

  bool get _memberDialogOpen => _memberDialogOwner != null;

  Object? _claimMemberDialog() {
    if (_memberDialogOpen) return null;
    final owner = Object();
    _memberDialogOwner = owner;
    return owner;
  }

  void _releaseMemberDialog(Object owner) {
    if (identical(_memberDialogOwner, owner)) _memberDialogOwner = null;
  }

  @override
  void initState() {
    super.initState();
    _textController.text = ref.read(postCreationProvider).text;
    // Request focus when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(postCreationProvider.notifier).refreshDraftOnOpen();
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _dismissAppealDialog();
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
    ref.listen<int>(
      contentMutationRegistryProvider.select(
        (registry) => registry.sessionEpoch,
      ),
      (previous, next) {
        if (previous != null && previous != next) {
          _dismissAppealDialog();
        }
      },
    );
    final canCreate = ref.watch(canCreatePostProvider);
    final privateImagesEnabled = ref.watch(privateImageUploadsEnabledProvider);
    final imageBlocksPost =
        privateImagesEnabled &&
        canCreate &&
        ref.watch(privateImageUploadProvider).blocksPost;
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
      canPop:
          !imageBlocksPost &&
          !state.isSubmitting &&
          (state.text.isEmpty || state.isSuccess),
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
                child: FilledButton(
                  onPressed:
                      state.isSubmitting ||
                          state.isRestoring ||
                          imageBlocksPost ||
                          !state.isValid ||
                          !canCreate
                      ? null
                      : _handleSubmit,
                  child: Semantics(
                    label: state.isSubmitting ? 'Submitting post' : null,
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
                          child: Text(
                            state.errorResult?.outcomeUncertain == true
                                ? 'Retry submission'
                                : 'Post',
                          ),
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
                            key: ValueKey(
                              'post-create-input:$inputEpoch:${state.isRestoring}',
                            ),
                            controller: _textController,
                            focusNode: _focusNode,
                            minLines: 5,
                            maxLines: 10,
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
                            'How did you write this?',
                            style: context.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Choose one. AI-assisted text is limited to 249 characters.',
                            style: context.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          TextButton(
                            onPressed: _showPostingPolicy,
                            child: const Text('Posting policy'),
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
                          if (privateImagesEnabled && canCreate)
                            PrivateImageUploadCard(canEdit: canEdit)
                          else ...[
                            Text(
                              'Photos are not available yet',
                              style: context.textTheme.titleSmall,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Image sharing will open after the required safety '
                              'and authenticity checks are ready. You can submit text for review.',
                              style: context.textTheme.bodySmall,
                            ),
                          ],
                          const SizedBox(height: 12),
                          Text(
                            'Submissions stay private while publication checks are pending. '
                            'Being under review does not mean AI assessment has completed.',
                            style: context.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
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

  void _showPostingPolicy() {
    final owner = _claimMemberDialog();
    if (owner == null) return;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        scrollable: true,
        title: const Text('Posting policy'),
        content: const Text(_policyReminderMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    ).whenComplete(() => _releaseMemberDialog(owner));
  }

  void _handleSubmit() async {
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
    if (ref.read(privateImageUploadsEnabledProvider) &&
        ref.read(privateImageUploadProvider).blocksPost) {
      LythSnackbar.info(
        context: context,
        message:
            'Finish or clear the private image selection before closing. Uploaded images remain private.',
      );
      return;
    }
    if (_memberDialogOpen) return;
    final state = ref.read(postCreationProvider);
    if (state.isSubmitting) {
      LythSnackbar.info(
        context: context,
        message: 'Sending your post. Please wait for confirmation.',
      );
      return;
    }
    if (state.errorResult?.outcomeUncertain == true) {
      _leaveComposer();
      return;
    }
    if (state.text.isNotEmpty && !state.isSuccess) {
      if (state.draftStatus == 'Draft saved on this device.' ||
          state.draftStatus == 'Draft restored on this device.') {
        _leaveComposer();
        return;
      }
      if (state.draftStatus == 'Saving draft…') {
        LythSnackbar.info(
          context: context,
          message:
              'Your draft is still saving. Wait for confirmation before closing.',
        );
        return;
      }
      _showDiscardDialog(context);
    } else {
      ref.read(postCreationProvider.notifier).reset();
      _leaveComposer();
    }
  }

  void _showDiscardDialog(BuildContext context) {
    final owner = _claimMemberDialog();
    if (owner == null) return;
    final registry = ref.read(contentMutationRegistryProvider);
    final reloadBlockKey = 'post-discard:${identityHashCode(owner)}';
    registry.setReloadBlocked(reloadBlockKey, true);
    final epoch = registry.sessionEpoch;
    final actor = ref.read(currentUserProvider)?.id ?? 'session';
    var saving = false;
    String? error;
    late final Future<void> dialogFuture;
    dialogFuture = showDialog<void>(
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
                        await dialogFuture;
                        await WidgetsBinding.instance.endOfFrame;
                        if (!mounted) return;
                        _leaveComposer();
                      },
                child: Text(saving ? 'Discarding…' : 'Discard'),
              ),
            ],
          ),
        ),
      ),
    );
    dialogFuture.whenComplete(() {
      registry.setReloadBlocked(reloadBlockKey, false);
      _releaseMemberDialog(owner);
    });
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
    if (result.post.moderationState == 'allowed') {
      LythSnackbar.success(
        context: context,
        message: 'Post created successfully!',
      );
    } else {
      LythSnackbar.info(
        context: context,
        message: 'Post submitted. Publication checks are pending.',
      );
    }

    // Reset and close
    ref.read(postCreationProvider.notifier).reset();
    _leaveComposer(result.post);
  }

  void _leaveComposer([Object? result]) {
    if (ModalRoute.of(context)?.isCurrent != true ||
        !TickerMode.valuesOf(context).enabled) {
      return;
    }
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop(result);
      return;
    }
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      final uri = GoRouterState.of(context).uri;
      router.go(
        Uri(
          path: '/',
          queryParameters: {...uri.queryParameters, 'tab': 'discover'},
        ).toString(),
      );
    }
  }

  Future<void> _submitBlockedAppeal(String caseId) async {
    if (!mounted || _memberDialogOpen) return;
    final blocked = ref.read(postCreationProvider).blockedResult;
    if (blocked?.appealEligible != true || blocked?.appealCaseId != caseId) {
      return;
    }

    final owner = _claimMemberDialog();
    if (owner == null) return;
    _appealDialogOwner = owner;
    final registry = ref.read(contentMutationRegistryProvider);
    final reloadBlockKey = 'post-appeal:${identityHashCode(owner)}';
    registry.setReloadBlocked(reloadBlockKey, true);
    final sessionEpoch = registry.sessionEpoch;
    var statementValue = '';
    try {
      final navigator = Navigator.of(context, rootNavigator: true);
      final route = DialogRoute<String>(
        context: context,
        builder: (dialogContext) {
          if (!identical(_appealDialogOwner, owner) ||
              sessionEpoch != registry.sessionEpoch) {
            return const SizedBox.shrink();
          }
          return AlertDialog(
            scrollable: true,
            title: Text(
              'Request an appeal review',
              style: dialogContext.textTheme.headlineSmall,
            ),
            content: TextField(
              onChanged: (value) => statementValue = value,
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
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () =>
                    Navigator.of(dialogContext).pop(statementValue.trim()),
                child: const Text('Submit'),
              ),
            ],
          );
        },
        barrierColor:
            DialogTheme.of(context).barrierColor ??
            Theme.of(context).dialogTheme.barrierColor ??
            LythSemanticColors.canvas.withValues(alpha: 0.54),
        barrierDismissible: true,
        barrierLabel: MaterialLocalizations.of(
          context,
        ).modalBarrierDismissLabel,
        useSafeArea: true,
        themes: InheritedTheme.capture(from: context, to: navigator.context),
        traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
      );
      _appealDialogRouteOwner = owner;
      _appealDialogNavigator = navigator;
      _appealDialogRoute = route;
      final statement = await navigator.push<String>(route);
      if (identical(_appealDialogRouteOwner, owner)) {
        _appealDialogRouteOwner = null;
        _appealDialogNavigator = null;
        _appealDialogRoute = null;
      }

      if (!mounted ||
          sessionEpoch != registry.sessionEpoch ||
          statement == null) {
        return;
      }
      final currentBlocked = ref.read(postCreationProvider).blockedResult;
      if (currentBlocked?.appealEligible != true ||
          currentBlocked?.appealCaseId != caseId) {
        return;
      }
      if (statement.trim().length < 10) {
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

      bool success;
      try {
        success = await ref.read(appealProvider).submit(caseId, statement);
      } catch (_) {
        if (!mounted || sessionEpoch != registry.sessionEpoch) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Failed to submit appeal. Please try again.',
              style: context.textTheme.bodyMedium,
            ),
          ),
        );
        return;
      }
      if (!mounted || sessionEpoch != registry.sessionEpoch) return;

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
    } finally {
      registry.setReloadBlocked(reloadBlockKey, false);
      if (identical(_appealDialogOwner, owner)) {
        _appealDialogOwner = null;
      }
      if (identical(_appealDialogRouteOwner, owner)) {
        _appealDialogRouteOwner = null;
        _appealDialogNavigator = null;
        _appealDialogRoute = null;
      }
      _releaseMemberDialog(owner);
    }
  }

  void _dismissAppealDialog() {
    final owner = _appealDialogOwner;
    if (owner != null) {
      _appealDialogOwner = null;
      _releaseMemberDialog(owner);
    }

    if (_appealDialogRouteOwner == null) return;
    final navigator = _appealDialogNavigator;
    final route = _appealDialogRoute;
    _appealDialogRouteOwner = null;
    _appealDialogNavigator = null;
    _appealDialogRoute = null;
    if (navigator == null || route == null) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!navigator.mounted || !route.isActive) return;
      navigator.removeRoute(route);
    });
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

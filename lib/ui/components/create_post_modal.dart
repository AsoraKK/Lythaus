// ignore_for_file: public_member_api_docs

// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_chip.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';

class CreatePostModal extends ConsumerStatefulWidget {
  const CreatePostModal({super.key, this.canMarkNews = true});

  final bool canMarkNews;

  @override
  ConsumerState<CreatePostModal> createState() => _CreatePostModalState();
}

class _CreatePostModalState extends ConsumerState<CreatePostModal> {
  static const String _policyReminderMessage =
      'Choose Human-authored, AI-assisted, or AI-generated before posting.\n'
      'AI-generated posts are labeled and do not earn reputation.\n'
      'Community appeal votes are advisory; a moderator records the final decision.\n'
      'This is an invite-only Alpha.';

  ContentType selectedType = ContentType.text;
  bool isNews = false;
  bool _policyReminderShown = false;
  final GlobalKey<TooltipState> _policyTooltipKey = GlobalKey<TooltipState>();
  late final TextEditingController controller;
  late final TextEditingController mediaController;

  @override
  void initState() {
    super.initState();
    final state = ref.read(postCreationProvider);
    controller = TextEditingController(text: state.text);
    mediaController = TextEditingController(text: state.mediaUrl);
    isNews = state.isNews;
    selectedType = _typeFromString(state.contentType);
  }

  @override
  void dispose() {
    controller.dispose();
    mediaController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_policyReminderShown) {
      _policyReminderShown = true;
      _policyTooltipKey.currentState?.ensureTooltipVisible();
    }

    await runWithDeviceGuard(
      context,
      ref,
      IntegrityUseCase.postContent,
      () async {
        final notifier = ref.read(postCreationProvider.notifier);
        notifier.updateText(controller.text);
        notifier.setIsNews(isNews);
        notifier.setContentType(selectedType.name);

        final success = await notifier.submit();
        if (!mounted) return;
        final state = ref.read(postCreationProvider);

        if (state.isBlocked && state.blockedResult != null) {
          _showAiScan(state.blockedResult!);
          return;
        }

        if (state.isLimitExceeded && state.limitExceededResult != null) {
          _showLimitSheet(state.limitExceededResult!);
          return;
        }

        if (success) {
          final user = ref.read(currentUserProvider);
          if (user != null) {
            await ref
                .read(analyticsEventTrackerProvider)
                .logEventOnce(
                  ref.read(analyticsClientProvider),
                  AnalyticsEvents.firstPost,
                  userId: user.id,
                );
          }
          LythSnackbar.success(context: context, message: 'Posted to Lythaus');
          notifier.reset();
          Navigator.of(context).maybePop();
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(postCreationProvider);
    final canCreate = ref.watch(canCreatePostProvider);
    final notifier = ref.read(postCreationProvider.notifier);
    final spacing = context.spacing;

    ref.listen<PostCreationState>(postCreationProvider, (previous, next) {
      final errorCode = next.errorResult?.code;
      if (errorCode != null &&
          errorCode != previous?.errorResult?.code &&
          isDeviceIntegrityBlockedCode(errorCode)) {
        showDeviceIntegrityBlockedDialog(context);
        ref.read(postCreationProvider.notifier).clearError();
      }
    });

    return Padding(
      padding: EdgeInsets.all(spacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Create',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: spacing.lg),
          Wrap(
            spacing: spacing.xs,
            children: ContentType.values
                .where((type) => type != ContentType.mixed)
                .map((type) {
                  final selected = selectedType == type;
                  return ChoiceChip(
                    label: Text(_label(type)),
                    selected: selected,
                    onSelected: (_) {
                      setState(() => selectedType = type);
                      notifier.setContentType(type.name);
                    },
                  );
                })
                .toList(),
          ),
          SizedBox(height: spacing.lg),
          LythTextField(
            controller: controller,
            onChanged: notifier.updateText,
            maxLines: 4,
            placeholder: 'Share an update...',
            errorText: state.validationError,
          ),
          SizedBox(height: spacing.md),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Authorship disclosure (required)',
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
          SizedBox(height: spacing.xs),
          Wrap(
            spacing: spacing.xs,
            runSpacing: spacing.xs,
            children: [
              ChoiceChip(
                label: const Text('Human-authored'),
                selected: state.aiLabel == 'human',
                onSelected: (_) => notifier.setAiLabel('human'),
              ),
              ChoiceChip(
                label: const Text('AI-assisted'),
                selected: state.aiLabel == 'assisted',
                onSelected: (_) => notifier.setAiLabel('assisted'),
              ),
              ChoiceChip(
                label: const Text('AI-generated'),
                selected: state.aiLabel == 'generated',
                onSelected: (_) => notifier.setAiLabel('generated'),
              ),
            ],
          ),
          SizedBox(height: spacing.lg),
          Align(
            alignment: Alignment.centerLeft,
            child: LythButton.tertiary(
              label: 'Add media',
              icon: Icons.attach_file_outlined,
              onPressed: _openMediaPicker,
            ),
          ),
          SizedBox(height: spacing.xs),
          if (state.mediaUrl != null)
            Wrap(
              spacing: spacing.xs,
              runSpacing: spacing.xs,
              children: [
                LythChip.input(
                  label: state.mediaUrl!,
                  onDeleted: () => notifier.updateMediaUrl(null),
                ),
              ],
            ),
          if (widget.canMarkNews) ...[
            SizedBox(height: spacing.sm),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('This is News'),
              subtitle: const Text(
                'Only Editorial Contributors can mark as news',
              ),
              value: isNews,
              onChanged: (value) {
                setState(() => isNews = value);
                notifier.setIsNews(value);
              },
            ),
          ],
          if (state.hasError &&
              state.errorResult != null &&
              state.errorResult?.code != ErrorCodes.deviceIntegrityBlocked)
            Padding(
              padding: EdgeInsets.only(top: spacing.sm),
              child: Text(
                state.errorResult!.message,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ),
          SizedBox(height: spacing.lg),
          Row(
            children: [
              Expanded(
                child: LythButton.secondary(
                  label: 'Cancel',
                  onPressed: state.isSubmitting
                      ? null
                      : () => Navigator.of(context).maybePop(),
                ),
              ),
              SizedBox(width: spacing.md),
              Expanded(
                child: Tooltip(
                  key: _policyTooltipKey,
                  message: _policyReminderMessage,
                  triggerMode: TooltipTriggerMode.manual,
                  showDuration: const Duration(seconds: 6),
                  child: LythButton.primary(
                    label: canCreate ? 'Post' : 'Sign in first',
                    onPressed: state.isSubmitting || !canCreate
                        ? null
                        : _handleSubmit,
                    isLoading: state.isSubmitting,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showAiScan(CreatePostBlocked blocked) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.all(context.spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'AI Scan',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            SizedBox(height: context.spacing.sm),
            Text(blocked.message),
            SizedBox(height: context.spacing.sm),
            Wrap(
              spacing: context.spacing.xs,
              children: blocked.categories
                  .map((c) => LythChip(label: c))
                  .toList(),
            ),
            SizedBox(height: context.spacing.lg),
            LythButton.primary(
              label: 'Close',
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ),
    );
  }

  void _showLimitSheet(CreatePostLimitExceeded limit) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.all(context.spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Post limit reached',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            SizedBox(height: context.spacing.sm),
            Text(limit.message),
            SizedBox(height: context.spacing.sm),
            Text('Tier: ${limit.tier} • Limit: ${limit.limit}'),
            Text('Retry after: ${limit.retryAfter.inMinutes} minutes'),
            SizedBox(height: context.spacing.lg),
            LythButton.primary(
              label: 'Got it',
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ),
    );
  }

  void _openMediaPicker() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.all(context.spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Add media',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            SizedBox(height: context.spacing.sm),
            LythTextField(
              controller: mediaController,
              label: 'Media URL',
              helperText: 'Paste an image or video URL.',
            ),
            SizedBox(height: context.spacing.lg),
            LythButton.primary(
              label: 'Attach',
              onPressed: () {
                ref
                    .read(postCreationProvider.notifier)
                    .updateMediaUrl(mediaController.text.trim());
                Navigator.of(context).maybePop();
              },
            ),
          ],
        ),
      ),
    );
  }

  String _label(ContentType type) {
    return switch (type) {
      ContentType.text => 'Text',
      ContentType.image => 'Image',
      ContentType.video => 'Video',
      ContentType.mixed => 'Mixed',
    };
  }

  ContentType _typeFromString(String value) {
    return ContentType.values.firstWhere(
      (type) => type.name == value,
      orElse: () => ContentType.text,
    );
  }
}

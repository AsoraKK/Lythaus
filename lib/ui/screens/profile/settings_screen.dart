// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/features/authenticity/alpha_screen.dart';
import 'package:lythaus/features/support/support_feedback_config.dart';
import 'package:lythaus/features/support/presentation/support_feedback_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _savingTrustVisibility = false;
  CancelToken? _visibilitySave;

  @override
  void dispose() {
    _visibilitySave?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final controller = ref.read(settingsProvider.notifier);
    final currentUser = ref.watch(currentUserProvider);
    ref.listen(authSessionRevisionProvider, (previous, next) {
      if (previous != next) {
        _visibilitySave?.cancel();
        _visibilitySave = null;
        setState(() => _savingTrustVisibility = false);
      }
    });
    final profileState = currentUser == null
        ? null
        : ref.watch(ownerProfileProvider);
    final profile = profileState?.valueOrNull;
    final selectedVisibility = profile?.user.id == currentUser?.id
        ? profile?.user.trustPassportVisibility
        : null;
    final canSaveVisibility =
        currentUser != null &&
        selectedVisibility != null &&
        profileState?.isLoading == false &&
        profileState?.hasError == false &&
        !_savingTrustVisibility;

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.md),
          children: [
            Text('Account', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Spacing.sm),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.security_outlined),
              title: const Text('Account security'),
              onTap: () {
                final router = GoRouter.maybeOf(context);
                if (router != null) {
                  router.go(
                    GoRouterState.of(
                      context,
                    ).uri.replace(path: '/settings/security').toString(),
                  );
                  return;
                }
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const AccountSecurityScreen(),
                  ),
                );
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.notifications_none),
              title: const Text('Notifications'),
              onTap: () {
                final router = GoRouter.maybeOf(context);
                if (router != null) {
                  router.go('/notifications');
                } else {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const NotificationsScreen(),
                    ),
                  );
                }
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notification settings'),
              onTap: () {
                final router = GoRouter.maybeOf(context);
                if (router != null) {
                  router.go(
                    GoRouterState.of(
                      context,
                    ).uri.replace(path: '/settings/notifications').toString(),
                  );
                  return;
                }
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const NotificationsSettingsScreen(),
                  ),
                );
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.privacy_tip_outlined),
              title: const Text('Privacy and your data'),
              subtitle: const Text(
                'Visibility, data export, and account deletion',
              ),
              onTap: () {
                final router = GoRouter.maybeOf(context);
                if (router != null) {
                  router.go(
                    GoRouterState.of(
                      context,
                    ).uri.replace(path: '/settings/privacy').toString(),
                  );
                  return;
                }
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PrivacySettingsScreen(),
                  ),
                );
              },
            ),
            if (currentUser != null && supportFeedbackEnabled)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.feedback_outlined),
                title: const Text('Report a problem or share an idea'),
                subtitle: const Text(
                  'Send a private report or suggestion and follow its history',
                ),
                onTap: () {
                  final router = GoRouter.maybeOf(context);
                  if (router != null) {
                    router.go('/settings/support');
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const SupportFeedbackScreen(),
                    ),
                  );
                },
              ),
            const Divider(height: Spacing.xl),
            Text('Preferences', style: Theme.of(context).textTheme.titleLarge),
            const Text(
              'These controls apply while the app is open. They reset when it restarts.',
            ),
            SwitchListTile(
              title: const Text('Swipe between profile tabs'),
              subtitle: const Text('Tabs remain available when swipe is off.'),
              value: settings.horizontalSwipeEnabled,
              onChanged: (_) => controller.toggleSwipeEnabled(),
            ),
            SwitchListTile(
              title: const Text('Left-handed mode (mirror nav)'),
              value: settings.leftHandedMode,
              onChanged: (_) => controller.toggleLeftHanded(),
            ),
            SwitchListTile(
              title: const Text('Haptics'),
              value: settings.hapticsEnabled,
              onChanged: (_) => controller.toggleHaptics(),
            ),
            const Divider(height: Spacing.xl),
            Text(
              'Public profile',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Trust Passport visibility'),
              subtitle: Text(
                currentUser == null
                    ? 'Sign in to manage what others see on your Trust Passport.'
                    : 'Choose how your Trust Passport appears to other users.',
              ),
            ),
            if (profileState?.isLoading == true)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: Spacing.sm),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            if (profileState?.hasError == true) ...[
              const Text('Unable to load your saved visibility.'),
              TextButton(
                onPressed: () => ref.invalidate(ownerProfileProvider),
                child: const Text('Retry visibility'),
              ),
            ],
            Wrap(
              spacing: Spacing.sm,
              runSpacing: Spacing.sm,
              children: [
                for (final option in const {
                  'public_expanded': 'Public',
                  'public_minimal': 'Minimal',
                  'private': 'Private',
                }.entries)
                  ChoiceChip(
                    label: Text(option.value),
                    selected: selectedVisibility == option.key,
                    onSelected: canSaveVisibility
                        ? (selected) {
                            if (selected) _updateTrustVisibility(option.key);
                          }
                        : null,
                  ),
              ],
            ),
            if (_savingTrustVisibility)
              Semantics(
                liveRegion: true,
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: Spacing.sm),
                  child: Text('Saving visibility…'),
                ),
              ),
            const SizedBox(height: Spacing.xs),
            Text(
              'This setting changes profile presentation only. It does not change core feed ranking.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const Divider(height: Spacing.xl),
            if (currentUser != null) ...[
              Text(
                'Experimental',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.image_search_outlined),
                title: const Text('Private authenticity alpha'),
                subtitle: const Text(
                  'Availability depends on your approved access.',
                ),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const AuthenticityPrivateAlphaScreen(),
                  ),
                ),
              ),
              const Divider(height: Spacing.xl),
            ],
            ListTile(
              leading: const Icon(Icons.help_outline),
              title: const Text('Help and support'),
              subtitle: const Text('Guidance, account help and policies'),
              onTap: () async {
                try {
                  if (await launchUrl(Uri.https('lythaus.co', '/help'))) return;
                } catch (_) {}
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Help is available at lythaus.co/help.'),
                    ),
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _updateTrustVisibility(String visibility) async {
    final user = ref.read(currentUserProvider);
    if (user == null || _savingTrustVisibility) {
      return;
    }
    final cancelToken = CancelToken();
    final session = ref.read(authSessionRevisionProvider.notifier);
    final revision = session.revision;
    final stop = session.cancelOnChange(cancelToken.cancel);
    _visibilitySave = cancelToken;
    setState(() => _savingTrustVisibility = true);
    bool isCurrentSave() =>
        mounted &&
        identical(_visibilitySave, cancelToken) &&
        !cancelToken.isCancelled &&
        session.revision == revision &&
        ref.read(currentUserProvider)?.id == user.id;
    try {
      final token = await Future.any<String?>([
        ref.read(jwtProvider.future),
        cancelToken.whenCancel.then<String?>((error) => throw error),
      ]);
      if (!mounted || !isCurrentSave()) return;
      if (token == null || token.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sign in to update trust visibility.')),
        );
        return;
      }
      final saved = await ref
          .read(profilePreferencesServiceProvider)
          .updateTrustPassportVisibility(
            accessToken: token,
            visibility: visibility,
            cancelToken: cancelToken,
          );
      if (!mounted || !isCurrentSave()) return;
      if (saved.user.id != user.id ||
          saved.user.trustPassportVisibility != visibility) {
        throw const FormatException('Invalid saved visibility');
      }
      invalidateOwnerProfileProjections(ref, user.id);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile visibility saved.')),
      );
    } on DioException catch (error) {
      final message = error.response?.statusCode == 429
          ? 'Too many profile updates. Please wait before trying again.'
          : 'Unable to update trust visibility.';
      if (mounted && isCurrentSave() && !CancelToken.isCancel(error)) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (_) {
      if (mounted && isCurrentSave()) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update trust visibility.')),
        );
      }
    } finally {
      stop();
      if (mounted && identical(_visibilitySave, cancelToken)) {
        _visibilitySave = null;
        setState(() => _savingTrustVisibility = false);
      }
    }
  }
}

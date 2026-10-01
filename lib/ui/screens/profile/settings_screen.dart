// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/features/authenticity/alpha_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _savingTrustVisibility = false;

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final controller = ref.read(settingsProvider.notifier);
    final currentUser = ref.watch(currentUserProvider);
    final profileState = currentUser == null
        ? null
        : ref.watch(publicUserProvider(currentUser.id));
    final profileVisibility =
        profileState?.valueOrNull?.trustPassportVisibility;
    final selectedVisibility =
        profileVisibility ?? settings.trustPassportVisibility;

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.md),
          children: [
            Text('Account', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Spacing.sm),
            if (currentUser != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.image_search_outlined),
                title: const Text('Private authenticity alpha'),
                subtitle: const Text(
                  'Safety, SAFE-A, forensic evidence, and bounded visual explanations',
                ),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const AuthenticityPrivateAlphaScreen(),
                  ),
                ),
              ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.notifications_none),
              title: const Text('Notifications'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const NotificationsScreen(),
                ),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notification settings'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const NotificationsSettingsScreen(),
                ),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.privacy_tip_outlined),
              title: const Text('Privacy and your data'),
              subtitle: const Text(
                'Visibility, data export, and account deletion',
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const PrivacySettingsScreen(),
                ),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.security_outlined),
              title: const Text('Account security'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const AccountSecurityScreen(),
                ),
              ),
            ),
            const Divider(height: Spacing.xl),
            Text('Preferences', style: Theme.of(context).textTheme.titleLarge),
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
                    onSelected: currentUser == null || _savingTrustVisibility
                        ? null
                        : (selected) {
                            if (selected) _updateTrustVisibility(option.key);
                          },
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
    if (user == null) {
      return;
    }

    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to update trust visibility.')),
      );
      return;
    }

    setState(() => _savingTrustVisibility = true);
    try {
      await ref
          .read(profilePreferencesServiceProvider)
          .updateTrustPassportVisibility(
            accessToken: token,
            visibility: visibility,
          );
      ref
          .read(settingsProvider.notifier)
          .setTrustPassportVisibility(visibility);
      ref.invalidate(publicUserProvider(user.id));
      ref.invalidate(trustPassportProvider(user.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile visibility saved.')),
        );
      }
    } on DioException catch (error) {
      final message = error.response?.statusCode == 429
          ? 'Too many profile updates. Please wait before trying again.'
          : 'Unable to update trust visibility.';
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update trust visibility.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _savingTrustVisibility = false);
      }
    }
  }
}

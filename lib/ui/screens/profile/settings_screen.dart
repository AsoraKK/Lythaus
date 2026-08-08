// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';

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

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.md),
        children: [
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
          SegmentedButton<String>(
            segments: const [
              ButtonSegment<String>(
                value: 'public_expanded',
                label: Text('Public'),
                icon: Icon(Icons.visibility_outlined),
              ),
              ButtonSegment<String>(
                value: 'public_minimal',
                label: Text('Minimal'),
                icon: Icon(Icons.visibility_off_outlined),
              ),
              ButtonSegment<String>(
                value: 'private',
                label: Text('Private'),
                icon: Icon(Icons.lock_outline),
              ),
            ],
            selected: {selectedVisibility},
            onSelectionChanged: currentUser == null || _savingTrustVisibility
                ? null
                : (selection) {
                    final next = selection.first;
                    if (next == selectedVisibility) {
                      return;
                    }
                    _updateTrustVisibility(next);
                  },
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            'This setting changes profile presentation only. It does not change core feed ranking.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
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

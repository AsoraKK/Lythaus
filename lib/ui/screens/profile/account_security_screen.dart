// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/presentation/passkeys_screen.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class AccountSecurityScreen extends ConsumerWidget {
  const AccountSecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Account security')),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.md),
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.verified_user_outlined),
              title: const Text('Signed-in account'),
              subtitle: Text(user?.email ?? 'No active account'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.badge_outlined),
              title: const Text('Account role'),
              subtitle: Text(user?.role.name ?? 'None'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule_outlined),
              title: const Text('Session expiry'),
              subtitle: Text(
                user?.tokenExpires == null
                    ? 'Not available'
                    : DateFormat.yMMMd().add_jm().format(
                        user!.tokenExpires!.toLocal(),
                      ),
              ),
            ),
            const Divider(height: Spacing.xl),
            if (user != null &&
                ref.watch(passkeyAvailabilityProvider).valueOrNull == true)
              ListTile(
                leading: const Icon(Icons.key_outlined),
                title: const Text('Passkeys'),
                subtitle: const Text('Add, verify, rename or remove a passkey'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PasskeysScreen(),
                  ),
                ),
              ),
            FilledButton.tonalIcon(
              onPressed: user == null
                  ? null
                  : () async {
                      await ref.read(authStateProvider.notifier).signOut();
                      if (context.mounted) {
                        Navigator.of(
                          context,
                        ).popUntil((route) => route.isFirst);
                      }
                    },
              icon: const Icon(Icons.logout),
              label: const Text('Sign out of all sessions'),
            ),
          ],
        ),
      ),
    );
  }
}

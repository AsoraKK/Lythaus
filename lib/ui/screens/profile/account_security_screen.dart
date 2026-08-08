// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class AccountSecurityScreen extends ConsumerWidget {
  const AccountSecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return Scaffold(
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
            title: const Text('Internal role'),
            subtitle: Text(user?.role.name ?? 'None'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule_outlined),
            title: const Text('Session expiry'),
            subtitle: Text(
              user?.tokenExpires?.toLocal().toString() ??
                  'Managed by the identity provider',
            ),
          ),
          const Divider(height: Spacing.xl),
          FilledButton.tonalIcon(
            onPressed: user == null
                ? null
                : () async {
                    await ref.read(authStateProvider.notifier).signOut();
                    if (context.mounted) {
                      Navigator.of(context).popUntil((route) => route.isFirst);
                    }
                  },
            icon: const Icon(Icons.logout),
            label: const Text('Sign out on this device'),
          ),
        ],
      ),
    );
  }
}

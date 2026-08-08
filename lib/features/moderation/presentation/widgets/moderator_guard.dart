// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';

const bool _kEnableModerationConsole = bool.fromEnvironment(
  'ENABLE_MODERATION_CONSOLE',
  defaultValue: false,
);

class ModeratorGuard extends ConsumerWidget {
  const ModeratorGuard({
    super.key,
    required this.child,
    this.title = 'Moderation Console',
  });

  final Widget child;
  final String title;

  bool _isModerator(User? user) {
    return user?.role == UserRole.moderator || user?.role == UserRole.admin;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return authState.when(
      loading: () => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, stackTrace) => _buildUnauthorized(context),
      data: (user) {
        final allowed = _isModerator(user) || _kEnableModerationConsole;
        if (!allowed) {
          return _buildUnauthorized(context);
        }
        return child;
      },
    );
  }

  Widget _buildUnauthorized(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.block_outlined,
                size: 64,
                color: theme.colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                'Moderator access required',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'You need elevated permissions to access these internal tools.',
                style: theme.textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

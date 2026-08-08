// ignore_for_file: public_member_api_docs

/// LYTHAUS NOTIFICATIONS - PERMISSION PRE-PROMPT
///
/// Pre-prompt UI following iOS best practices:
/// - Shows before requesting OS permission
/// - Explains value proposition
/// - Allows "Not Now" and "Enable Notifications"
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/notifications/application/notification_permission_service.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class NotificationPermissionPrompt extends ConsumerStatefulWidget {
  final VoidCallback? onPermissionGranted;
  final VoidCallback? onPermissionDenied;

  const NotificationPermissionPrompt({
    super.key,
    this.onPermissionGranted,
    this.onPermissionDenied,
  });

  @override
  ConsumerState<NotificationPermissionPrompt> createState() =>
      _NotificationPermissionPromptState();
}

class _NotificationPermissionPromptState
    extends ConsumerState<NotificationPermissionPrompt> {
  final _permissionService = NotificationPermissionService();
  bool _isRequesting = false;

  Future<void> _handleEnableNotifications() async {
    if (_isRequesting) return;

    setState(() => _isRequesting = true);

    try {
      final status = await _permissionService.requestPermission();

      if (status == NotificationPermissionStatus.authorized ||
          status == NotificationPermissionStatus.provisional) {
        widget.onPermissionGranted?.call();
      } else {
        widget.onPermissionDenied?.call();
      }
    } finally {
      if (mounted) {
        setState(() => _isRequesting = false);
      }
    }
  }

  void _handleNotNow() {
    widget.onPermissionDenied?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final spacing = context.spacing;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(spacing.xxl),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.top -
                  MediaQuery.of(context).padding.bottom -
                  spacing.xxl * 2, // padding
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: spacing.xxxl),

                // Illustration
                Icon(
                  Icons.notifications_active_outlined,
                  size: 100,
                  color: colorScheme.primary,
                ),

                SizedBox(height: spacing.xxl),

                // Title
                Text(
                  'Stay Connected',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),

                SizedBox(height: spacing.md),

                // Body text
                Text(
                  'Get notified when people interact with your posts, when friends '
                  'post new content, and important updates about your account.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: colorScheme.onSurface.withValues(alpha: 0.7),
                  ),
                  textAlign: TextAlign.center,
                ),

                SizedBox(height: spacing.xxl),

                // Benefits list
                const _BenefitItem(
                  icon: Icons.people_outline,
                  title: 'Social Updates',
                  subtitle: 'Comments, likes, and new followers',
                ),

                SizedBox(height: spacing.md),

                const _BenefitItem(
                  icon: Icons.security_outlined,
                  title: 'Security Alerts',
                  subtitle: 'Important account and safety notifications',
                ),

                SizedBox(height: spacing.md),

                const _BenefitItem(
                  icon: Icons.tune_outlined,
                  title: 'Full Control',
                  subtitle: 'Customize categories and quiet hours anytime',
                ),

                SizedBox(height: spacing.xxxl),

                // Enable button
                LythButton.primary(
                  label: 'Enable Notifications',
                  onPressed: _isRequesting ? null : _handleEnableNotifications,
                  isLoading: _isRequesting,
                ),

                SizedBox(height: spacing.md),

                // Not now button
                LythButton.tertiary(
                  label: 'Not Now',
                  onPressed: _isRequesting ? null : _handleNotNow,
                ),

                SizedBox(height: spacing.md),

                // Privacy note
                Text(
                  'You can change notification preferences in Settings at any time.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  textAlign: TextAlign.center,
                ),

                SizedBox(height: spacing.lg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BenefitItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _BenefitItem({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 24, color: colorScheme.onPrimaryContainer),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

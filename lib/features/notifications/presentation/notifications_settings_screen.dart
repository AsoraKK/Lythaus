// ignore_for_file: public_member_api_docs

/// LYTHAUS NOTIFICATIONS - SETTINGS SCREEN
///
/// Notification preferences management:
/// - Category toggles (social, news, marketing)
/// - Quiet hours grid (24-hour touch selector)
/// - Timezone display
/// - Device management
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class NotificationsSettingsScreen extends ConsumerWidget {
  const NotificationsSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferencesAsync = ref.watch(preferencesControllerProvider);
    final devicesAsync = ref.watch(devicesControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Notification Settings')),
      body: preferencesAsync.when(
        data: (preferences) => ListView(
          padding: EdgeInsets.all(context.spacing.lg),
          children: [
            _CategoryTogglesSection(
              preferences: preferences,
              onUpdate: (prefs) async {
                try {
                  await ref
                      .read(preferencesControllerProvider.notifier)
                      .update(prefs);
                  if (context.mounted) {
                    LythSnackbar.success(
                      context: context,
                      message: 'Preferences updated',
                      duration: const Duration(seconds: 2),
                    );
                  }
                } catch (e) {
                  if (context.mounted) {
                    LythSnackbar.error(
                      context: context,
                      message: 'Failed to update: $e',
                    );
                  }
                }
              },
            ),
            SizedBox(height: context.spacing.xxl),
            _QuietHoursSection(
              preferences: preferences,
              onUpdate: (prefs) async {
                try {
                  await ref
                      .read(preferencesControllerProvider.notifier)
                      .update(prefs);
                } catch (e) {
                  if (context.mounted) {
                    LythSnackbar.error(
                      context: context,
                      message: 'Failed to update: $e',
                    );
                  }
                }
              },
            ),
            SizedBox(height: context.spacing.xxl),
            devicesAsync.when(
              data: (devices) => _DevicesSection(
                devices: devices,
                onRevoke: (deviceId) async {
                  try {
                    await ref
                        .read(devicesControllerProvider.notifier)
                        .revoke(deviceId);
                    if (context.mounted) {
                      LythSnackbar.success(
                        context: context,
                        message: 'Device removed',
                      );
                    }
                  } catch (e) {
                    if (context.mounted) {
                      LythSnackbar.error(
                        context: context,
                        message: 'Failed to remove: $e',
                      );
                    }
                  }
                },
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error loading devices: $e')),
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error loading preferences: $error'),
              SizedBox(height: context.spacing.lg),
              LythButton.primary(
                label: 'Retry',
                onPressed: () {
                  ref.read(preferencesControllerProvider.notifier).load();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// CATEGORY TOGGLES
// ============================================================================

class _CategoryTogglesSection extends StatelessWidget {
  final UserNotificationPreferences preferences;
  final ValueChanged<UserNotificationPreferences> onUpdate;

  const _CategoryTogglesSection({
    required this.preferences,
    required this.onUpdate,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Categories',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: spacing.xs),
        Text(
          'Choose which types of notifications you want to receive',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        SizedBox(height: spacing.lg),
        _CategoryToggle(
          icon: Icons.people_outline,
          title: 'Social Updates',
          subtitle: 'Comments, likes, follows, and friend activity',
          value: preferences.categories.social,
          onChanged: (value) {
            onUpdate(
              preferences.copyWith(
                categories: preferences.categories.copyWith(social: value),
              ),
            );
          },
        ),
        SizedBox(height: spacing.md),
        _CategoryToggle(
          icon: Icons.article_outlined,
          title: 'News & Updates',
          subtitle: 'App news and feature announcements',
          value: preferences.categories.news,
          onChanged: (value) {
            onUpdate(
              preferences.copyWith(
                categories: preferences.categories.copyWith(news: value),
              ),
            );
          },
        ),
        SizedBox(height: spacing.md),
        _CategoryToggle(
          icon: Icons.campaign_outlined,
          title: 'Marketing',
          subtitle: 'Special offers and promotions',
          value: preferences.categories.marketing,
          onChanged: (value) {
            onUpdate(
              preferences.copyWith(
                categories: preferences.categories.copyWith(marketing: value),
              ),
            );
          },
        ),
        SizedBox(height: spacing.md),
        LythCard(
          padding: EdgeInsets.all(spacing.md),
          backgroundColor: theme.colorScheme.primaryContainer.withValues(
            alpha: 0.3,
          ),
          borderColor: theme.colorScheme.primary.withValues(alpha: 0.4),
          child: Row(
            children: [
              Icon(
                Icons.info_outline,
                size: 20,
                color: theme.colorScheme.primary,
              ),
              SizedBox(width: spacing.md),
              Expanded(
                child: Text(
                  'Safety and security notifications are always enabled',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryToggle extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _CategoryToggle({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LythCard(
      padding: EdgeInsets.zero,
      borderColor: theme.colorScheme.outlineVariant,
      child: SwitchListTile(
        secondary: Icon(icon, color: theme.colorScheme.primary),
        title: Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(subtitle),
        value: value,
        onChanged: onChanged,
      ),
    );
  }
}

// ============================================================================
// QUIET HOURS GRID
// ============================================================================

class _QuietHoursSection extends StatelessWidget {
  final UserNotificationPreferences preferences;
  final ValueChanged<UserNotificationPreferences> onUpdate;

  const _QuietHoursSection({required this.preferences, required this.onUpdate});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quiet Hours',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: spacing.xs),
        Text(
          'Tap hours to toggle quiet mode (safety alerts will still come through)',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        SizedBox(height: spacing.sm),
        Row(
          children: [
            Icon(Icons.access_time, size: 16, color: theme.colorScheme.primary),
            SizedBox(width: spacing.sm),
            Text(
              'Timezone: ${preferences.timezone}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
        SizedBox(height: spacing.lg),
        _QuietHoursGrid(
          quietHours: preferences.quietHours,
          onHourToggled: (hour) {
            onUpdate(
              preferences.copyWith(
                quietHours: preferences.quietHours.withHourToggled(hour),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _QuietHoursGrid extends StatelessWidget {
  final QuietHours quietHours;
  final ValueChanged<int> onHourToggled;

  const _QuietHoursGrid({
    required this.quietHours,
    required this.onHourToggled,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.lg),
      backgroundColor: theme.colorScheme.surfaceContainerHigh,
      child: Column(
        children: [
          // Grid of 24 hour cells (4 rows x 6 columns)
          for (int row = 0; row < 4; row++)
            Padding(
              padding: EdgeInsets.only(bottom: row < 3 ? spacing.sm : 0),
              child: Row(
                children: [
                  for (int col = 0; col < 6; col++)
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: col < 5 ? spacing.sm : 0,
                        ),
                        child: _HourCell(
                          hour: row * 6 + col,
                          isQuiet: quietHours.isQuietAt(row * 6 + col),
                          onTap: () => onHourToggled(row * 6 + col),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          SizedBox(height: spacing.lg),
          // Legend
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              SizedBox(width: spacing.sm),
              Text('Quiet', style: theme.textTheme.bodySmall),
              SizedBox(width: spacing.xxl),
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHigh,
                  border: Border.all(color: theme.colorScheme.outline),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              SizedBox(width: spacing.sm),
              Text('Active', style: theme.textTheme.bodySmall),
            ],
          ),
        ],
      ),
    );
  }
}

class _HourCell extends StatelessWidget {
  final int hour;
  final bool isQuiet;
  final VoidCallback onTap;

  const _HourCell({
    required this.hour,
    required this.isQuiet,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hourText = hour.toString().padLeft(2, '0');

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(context.radius.sm),
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: isQuiet
              ? theme.colorScheme.primary
              : theme.colorScheme.surfaceContainerHigh,
          border: Border.all(
            color: isQuiet
                ? theme.colorScheme.primary
                : theme.colorScheme.outline,
          ),
          borderRadius: BorderRadius.circular(context.radius.sm),
        ),
        child: Center(
          child: Text(
            hourText,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: isQuiet
                  ? theme.colorScheme.onPrimary
                  : theme.colorScheme.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// DEVICES SECTION
// ============================================================================

class _DevicesSection extends StatelessWidget {
  final List<UserDeviceToken> devices;
  final Future<void> Function(String deviceId) onRevoke;

  const _DevicesSection({required this.devices, required this.onRevoke});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Devices',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: spacing.xs),
        Text(
          'Manage devices receiving push notifications (max 3)',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        SizedBox(height: spacing.lg),
        if (devices.isEmpty)
          LythCard(
            padding: EdgeInsets.all(spacing.xxl),
            borderColor: theme.colorScheme.outlineVariant,
            child: Center(
              child: Column(
                children: [
                  Icon(
                    Icons.devices_outlined,
                    size: 48,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.3),
                  ),
                  SizedBox(height: spacing.md),
                  Text(
                    'No devices registered',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ...devices.map(
            (device) => Padding(
              padding: EdgeInsets.only(bottom: spacing.md),
              child: _DeviceCard(device: device, onRevoke: onRevoke),
            ),
          ),
      ],
    );
  }
}

class _DeviceCard extends StatelessWidget {
  final UserDeviceToken device;
  final Future<void> Function(String deviceId) onRevoke;

  const _DeviceCard({required this.device, required this.onRevoke});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final platform = device.platform == 'fcm' ? 'Android' : 'iOS';
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.lg),
      borderColor: theme.colorScheme.outlineVariant,
      child: Row(
        children: [
          Icon(
            device.platform == 'fcm' ? Icons.phone_android : Icons.phone_iphone,
            color: theme.colorScheme.primary,
          ),
          SizedBox(width: spacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  device.label ?? platform,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: spacing.xs),
                Text(
                  'Last seen: ${_formatLastSeen(device.lastSeenAt)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
          LythButton.tertiary(
            label: 'Remove',
            onPressed: () => onRevoke(device.id),
            size: LythButtonSize.small,
          ),
        ],
      ),
    );
  }

  String _formatLastSeen(DateTime lastSeen) {
    final now = DateTime.now();
    final diff = now.difference(lastSeen);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${lastSeen.month}/${lastSeen.day}/${lastSeen.year}';
  }
}

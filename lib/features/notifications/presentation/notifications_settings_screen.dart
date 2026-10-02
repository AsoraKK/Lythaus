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
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class NotificationsSettingsScreen extends ConsumerStatefulWidget {
  const NotificationsSettingsScreen({super.key});

  @override
  ConsumerState<NotificationsSettingsScreen> createState() =>
      _NotificationsSettingsScreenState();
}

class _NotificationsSettingsScreenState
    extends ConsumerState<NotificationsSettingsScreen> {
  bool _saving = false;
  final Set<String> _removing = {};
  int _sessionEpoch = 0;

  Future<void> _savePreferences(UserNotificationPreferences preferences) async {
    if (_saving) return;
    final epoch = _sessionEpoch;
    setState(() => _saving = true);
    try {
      await ref
          .read(preferencesControllerProvider.notifier)
          .update(preferences);
      if (mounted && epoch == _sessionEpoch) {
        LythSnackbar.success(context: context, message: 'Preferences updated');
      }
    } catch (_) {
      if (mounted && epoch == _sessionEpoch) {
        LythSnackbar.error(
          context: context,
          message: 'Unable to save preferences. Try again.',
        );
      }
    } finally {
      if (mounted && epoch == _sessionEpoch) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(currentUserProvider.select((user) => user?.id), (_, next) {
      setState(() {
        _sessionEpoch++;
        _saving = false;
        _removing.clear();
      });
    });
    if (ref.watch(guestModeProvider)) {
      return Scaffold(
        appBar: AppBar(title: const Text('Notification Settings')),
        body: const SignInRequired(
          message: 'Sign in to manage notifications.',
          returnTo: '/settings/notifications',
        ),
      );
    }
    final preferencesAsync = ref.watch(preferencesControllerProvider);
    final devicesAsync = ref.watch(devicesControllerProvider);

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Notification Settings'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: _saving
                ? const LinearProgressIndicator(
                    semanticsLabel: 'Saving preferences',
                  )
                : const SizedBox(height: 4),
          ),
        ),
        body: AbsorbPointer(
          absorbing: _saving,
          child: preferencesAsync.when(
            data: (preferences) => ListView(
              padding: EdgeInsets.all(context.spacing.lg),
              children: [
                if (preferences.delivery != null) ...[
                  for (final entry in const {
                    'emailEnabled': 'Email notifications',
                    'pushEnabled': 'Push notifications',
                    'repliesEnabled': 'Replies',
                    'moderationEnabled': 'Moderation updates',
                    'rewardsEnabled': 'Reward updates',
                  }.entries)
                    SwitchListTile(
                      title: Text(entry.value),
                      value: preferences.delivery![entry.key]!,
                      onChanged: (value) => _savePreferences(
                        preferences.copyWith(
                          delivery: {
                            ...preferences.delivery!,
                            entry.key: value,
                          },
                        ),
                      ),
                    ),
                  const Text('Quiet hours are not available yet.'),
                ] else ...[
                  _CategoryTogglesSection(
                    preferences: preferences,
                    onUpdate: _savePreferences,
                  ),
                  SizedBox(height: context.spacing.xxl),
                  _QuietHoursSection(
                    preferences: preferences,
                    onUpdate: _savePreferences,
                  ),
                ],
                SizedBox(height: context.spacing.xxl),
                devicesAsync.when(
                  data: (devices) => _DevicesSection(
                    devices: devices,
                    onRevoke: (deviceId) async {
                      if (!_removing.add(deviceId)) return;
                      final epoch = _sessionEpoch;
                      try {
                        await ref
                            .read(devicesControllerProvider.notifier)
                            .revoke(deviceId);
                        if (context.mounted && epoch == _sessionEpoch) {
                          LythSnackbar.success(
                            context: context,
                            message: 'Device removed',
                          );
                        }
                      } catch (e) {
                        if (context.mounted && epoch == _sessionEpoch) {
                          LythSnackbar.error(
                            context: context,
                            message: 'Unable to remove this device. Try again.',
                          );
                        }
                      } finally {
                        if (epoch == _sessionEpoch) _removing.remove(deviceId);
                      }
                    },
                  ),
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(
                    child: Column(
                      children: [
                        const Text('Unable to load devices.'),
                        LythButton.tertiary(
                          label: 'Retry devices',
                          onPressed: () => ref
                              .read(devicesControllerProvider.notifier)
                              .load(),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) => Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Unable to load preferences. Try again.'),
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
            color: theme.colorScheme.onSurfaceVariant,
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
          backgroundColor: context.semanticColors['infoSurface'],
          borderColor: context.semanticColors['info'],
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
                    color: context.semanticColors['info'],
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
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        SizedBox(height: spacing.sm),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Icon(Icons.access_time, size: 16, color: theme.colorScheme.primary),
            SizedBox(width: spacing.sm),
            Text(
              'Timezone: ${preferences.timezone}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
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
          Wrap(
            spacing: spacing.sm,
            runSpacing: spacing.sm,
            children: [
              for (var hour = 0; hour < 24; hour++)
                _HourCell(
                  hour: hour,
                  isQuiet: quietHours.isQuietAt(hour),
                  onTap: () => onHourToggled(hour),
                ),
            ],
          ),
          SizedBox(height: spacing.lg),
          Text(
            'Checked hours are quiet.',
            style: theme.textTheme.bodySmall,
            textAlign: TextAlign.center,
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
    final hourText = hour.toString().padLeft(2, '0');

    return Semantics(
      label: '$hourText:00',
      selected: isQuiet,
      child: FilterChip(
        label: Text(hourText),
        tooltip: '$hourText:00',
        selected: isQuiet,
        showCheckmark: true,
        materialTapTargetSize: MaterialTapTargetSize.padded,
        onSelected: (_) => onTap(),
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
          'Manage devices receiving push notifications',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
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
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  SizedBox(height: spacing.md),
                  Text(
                    'No devices registered',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
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
    final (platform, icon) = switch (device.platform) {
      'android' || 'fcm' => ('Android', Icons.phone_android),
      'ios' || 'apns' => ('iOS', Icons.phone_iphone),
      'web' => ('Web browser', Icons.web),
      _ => ('Device', Icons.devices),
    };
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.lg),
      borderColor: theme.colorScheme.outlineVariant,
      child: Row(
        children: [
          Icon(icon, color: theme.colorScheme.primary),
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
                  device.lastSeenAt == null
                      ? 'Registered: ${DateFormat.yMMMd().format(device.createdAt.toLocal())}'
                      : 'Last seen: ${_formatLastSeen(device.lastSeenAt!)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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
    return DateFormat.yMMMd().format(lastSeen.toLocal());
  }
}

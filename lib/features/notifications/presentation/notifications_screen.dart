// ignore_for_file: public_member_api_docs

/// LYTHAUS NOTIFICATIONS - NOTIFICATION CENTRE
///
/// Main notifications screen:
/// - Paginated list with continuationToken support
/// - Swipe actions (mark read, dismiss)
/// - Deep-link navigation
/// - Empty state
/// - Pull-to-refresh
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart'
    as models;
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Load notifications on init
    Future.microtask(
      () => ref
          .read(notificationsControllerProvider.notifier)
          .loadNotifications(),
    );
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final state = ref.read(notificationsControllerProvider);
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent * 0.8 &&
        !state.isLoadingMore &&
        state.continuationToken != null) {
      ref.read(notificationsControllerProvider.notifier).loadMore();
    }
  }

  Future<void> _handleRefresh() async {
    await ref
        .read(notificationsControllerProvider.notifier)
        .loadNotifications();
  }

  Future<void> _markAsRead(models.Notification notification) async {
    await ref
        .read(notificationsControllerProvider.notifier)
        .markAsRead(notification.id);
  }

  Future<void> _dismiss(models.Notification notification) async {
    await ref
        .read(notificationsControllerProvider.notifier)
        .dismiss(notification.id);
  }

  Future<void> _handleTap(models.Notification notification) async {
    if (!notification.read) {
      await _markAsRead(notification);
    }

    // TODO: Navigate via deep-link
    if (notification.deeplink != null) {
      debugPrint('Navigate to: ${notification.deeplink}');
      // Implement deep-link navigation here
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (state.notifications.any((n) => !n.read))
            LythButton.tertiary(
              size: LythButtonSize.small,
              label: 'Mark all read',
              onPressed: () {
                // TODO: Implement mark all as read
              },
            ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.hasError
          ? _ErrorState(
              message: state.errorMessage ?? 'Failed to load notifications',
              onRetry: _handleRefresh,
            )
          : state.notifications.isEmpty
          ? _EmptyState(onRefresh: _handleRefresh)
          : RefreshIndicator(
              onRefresh: _handleRefresh,
              child: ListView.separated(
                controller: _scrollController,
                itemCount:
                    state.notifications.length +
                    (state.continuationToken != null ? 1 : 0),
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  if (index >= state.notifications.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }

                  final notification = state.notifications[index];
                  return _NotificationCard(
                    notification: notification,
                    onTap: () => _handleTap(notification),
                    onMarkRead: () => _markAsRead(notification),
                    onDismiss: () => _dismiss(notification),
                  );
                },
              ),
            ),
    );
  }
}

// ============================================================================
// NOTIFICATION CARD
// ============================================================================

class _NotificationCard extends StatelessWidget {
  final models.Notification notification;
  final VoidCallback onTap;
  final VoidCallback onMarkRead;
  final VoidCallback onDismiss;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onMarkRead,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final scheme = theme.colorScheme;
    final backgroundColor = notification.read
        ? scheme.surface
        : scheme.primaryContainer.withValues(alpha: 0.18);

    return Dismissible(
      key: Key(notification.id),
      direction: DismissDirection.horizontal,
      background: _SwipeActionBackground(
        color: scheme.primary,
        iconColor: scheme.onPrimary,
        icon: Icons.check,
        alignment: Alignment.centerLeft,
      ),
      secondaryBackground: _SwipeActionBackground(
        color: scheme.error,
        iconColor: scheme.onError,
        icon: Icons.delete_outline,
        alignment: Alignment.centerRight,
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          // Left swipe: mark as read
          onMarkRead();
          return false;
        } else {
          // Right swipe: dismiss
          return true;
        }
      },
      onDismissed: (direction) {
        if (direction == DismissDirection.endToStart) {
          onDismiss();
        }
      },
      child: LythCard.clickable(
        onTap: onTap,
        padding: EdgeInsets.all(spacing.lg),
        backgroundColor: backgroundColor,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Category icon
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: _getCategoryColor(notification.category, scheme),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _getCategoryIcon(notification.category),
                size: 20,
                color: _getCategoryIconColor(notification.category, scheme),
              ),
            ),
            SizedBox(width: spacing.lg),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          notification.title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: notification.read
                                ? FontWeight.normal
                                : FontWeight.bold,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!notification.read)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: scheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  SizedBox(height: spacing.xs),
                  Text(
                    notification.body,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.7),
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  SizedBox(height: spacing.sm),
                  Text(
                    _formatTime(notification.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getCategoryIcon(models.NotificationCategory category) {
    return switch (category) {
      models.NotificationCategory.social => Icons.people,
      models.NotificationCategory.safety => Icons.shield,
      models.NotificationCategory.security => Icons.lock,
      models.NotificationCategory.news => Icons.article,
      models.NotificationCategory.marketing => Icons.campaign,
    };
  }

  Color _getCategoryColor(
    models.NotificationCategory category,
    ColorScheme scheme,
  ) {
    return switch (category) {
      models.NotificationCategory.social => scheme.primary,
      models.NotificationCategory.safety => scheme.tertiary,
      models.NotificationCategory.security => scheme.error,
      models.NotificationCategory.news => scheme.secondary,
      models.NotificationCategory.marketing => scheme.secondaryContainer,
    };
  }

  Color _getCategoryIconColor(
    models.NotificationCategory category,
    ColorScheme scheme,
  ) {
    return switch (category) {
      models.NotificationCategory.social => scheme.onPrimary,
      models.NotificationCategory.safety => scheme.onTertiary,
      models.NotificationCategory.security => scheme.onError,
      models.NotificationCategory.news => scheme.onSecondary,
      models.NotificationCategory.marketing => scheme.onSecondaryContainer,
    };
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${time.month}/${time.day}/${time.year}';
  }
}

class _SwipeActionBackground extends StatelessWidget {
  final Color color;
  final Color iconColor;
  final IconData icon;
  final Alignment alignment;

  const _SwipeActionBackground({
    required this.color,
    required this.iconColor,
    required this.icon,
    required this.alignment,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: color,
      alignment: alignment,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Icon(icon, color: iconColor),
    );
  }
}

// ============================================================================
// ERROR STATE
// ============================================================================

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(spacing.xxxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 80, color: theme.colorScheme.error),
            SizedBox(height: spacing.xxl),
            Text(
              'Something went wrong',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: spacing.md),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: spacing.xxxl),
            LythButton.primary(
              label: 'Try Again',
              onPressed: onRetry,
              icon: Icons.refresh,
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// EMPTY STATE
// ============================================================================

class _EmptyState extends StatelessWidget {
  final VoidCallback onRefresh;

  const _EmptyState({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(spacing.xxxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.notifications_none_outlined,
              size: 120,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
            ),
            SizedBox(height: spacing.xxl),
            Text(
              'No Notifications',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: spacing.md),
            Text(
              'When you get notifications, they will show up here',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: spacing.xxxl),
            LythButton.secondary(
              label: 'Refresh',
              onPressed: onRefresh,
              icon: Icons.refresh,
            ),
          ],
        ),
      ),
    );
  }
}

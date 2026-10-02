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
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/core/routing/deeplink_router.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
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
  final Set<String> _pending = {};
  bool _markingAll = false;
  int _sessionEpoch = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Load notifications on init
    Future.microtask(() async {
      if (!mounted || ref.read(guestModeProvider)) return;
      await ref
          .read(notificationsControllerProvider.notifier)
          .loadNotifications();
    });
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
        !state.hasError &&
        state.continuationToken != null) {
      ref.read(notificationsControllerProvider.notifier).loadMore();
    }
  }

  Future<void> _handleRefresh() async {
    await ref
        .read(notificationsControllerProvider.notifier)
        .loadNotifications();
  }

  void _message(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _markAsRead(models.Notification notification) async {
    final epoch = _sessionEpoch;
    if (_pending.contains(notification.id)) return false;
    setState(() => _pending.add(notification.id));
    await ref
        .read(notificationsControllerProvider.notifier)
        .markAsRead(notification.id);
    if (!mounted || epoch != _sessionEpoch) return false;
    setState(() => _pending.remove(notification.id));
    final read = ref
        .read(notificationsControllerProvider)
        .notifications
        .any((item) => item.id == notification.id && item.read);
    if (!read && !_markingAll) {
      _message('Could not mark this notification as read. Please try again.');
    }
    return read;
  }

  Future<void> _dismiss(models.Notification notification) async {
    final epoch = _sessionEpoch;
    if (_pending.contains(notification.id)) return;
    setState(() => _pending.add(notification.id));
    await ref
        .read(notificationsControllerProvider.notifier)
        .dismiss(notification.id);
    if (!mounted || epoch != _sessionEpoch) return;
    setState(() => _pending.remove(notification.id));
    if (ref
        .read(notificationsControllerProvider)
        .notifications
        .any((item) => item.id == notification.id)) {
      _message('Could not dismiss this notification. Please try again.');
    }
  }

  Future<void> _markAllRead() async {
    final epoch = _sessionEpoch;
    if (_markingAll) return;
    setState(() => _markingAll = true);
    final unread = ref
        .read(notificationsControllerProvider)
        .notifications
        .where((item) => !item.read)
        .toList();
    var failures = 0;
    for (final item in unread) {
      if (!mounted || epoch != _sessionEpoch) return;
      if (!await _markAsRead(item)) failures += 1;
    }
    if (!mounted || epoch != _sessionEpoch) return;
    setState(() => _markingAll = false);
    _message(
      failures == 0
          ? 'Loaded notifications marked as read.'
          : 'Some notifications could not be marked as read. Please try again.',
    );
  }

  Future<void> _handleTap(models.Notification notification) async {
    final epoch = _sessionEpoch;
    if (!notification.read) {
      await _markAsRead(notification);
    }

    if (!mounted || epoch != _sessionEpoch) return;
    final link = notification.deeplink;
    if (link == null || !DeeplinkRouter.canNavigate(link)) {
      _message('This notification has no available destination.');
      return;
    }
    await DeeplinkRouter.navigate(context, link);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(currentUserProvider.select((user) => user?.id), (_, next) {
      setState(() {
        _sessionEpoch++;
        _pending.clear();
        _markingAll = false;
      });
      final epoch = _sessionEpoch;
      if (next != null) {
        Future.microtask(() {
          if (mounted && epoch == _sessionEpoch) {
            ref
                .read(notificationsControllerProvider.notifier)
                .loadNotifications();
          }
        });
      }
    });
    if (ref.watch(guestModeProvider)) return _signIn();
    final state = ref.watch(notificationsControllerProvider);
    if (state.authRequired) return _signIn();

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Column(
                children: [
                  if (state.notifications.any((n) => !n.read))
                    Align(
                      alignment: Alignment.centerRight,
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: context.spacing.lg,
                        ),
                        child: LythButton(
                          variant: LythButtonVariant.tertiary,
                          size: LythButtonSize.small,
                          label: 'Mark all read',
                          tooltip: 'Mark loaded notifications as read',
                          isLoading: _markingAll,
                          onPressed: _markingAll ? null : _markAllRead,
                        ),
                      ),
                    ),
                  Expanded(
                    child: state.isLoading && state.notifications.isEmpty
                        ? const Center(child: CircularProgressIndicator())
                        : state.hasError && state.notifications.isEmpty
                        ? _ErrorState(
                            message: state.serviceUnavailable
                                ? 'Notifications are not available right now.'
                                : 'Could not load notifications. Check your connection and try again.',
                            onRetry: _handleRefresh,
                          )
                        : state.notifications.isEmpty
                        ? _EmptyState(onRefresh: _handleRefresh)
                        : RefreshIndicator(
                            onRefresh: _handleRefresh,
                            child: ListView.separated(
                              controller: _scrollController,
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount:
                                  state.notifications.length +
                                  (state.continuationToken != null ||
                                          state.hasError
                                      ? 1
                                      : 0),
                              separatorBuilder: (context, index) =>
                                  const Divider(height: 1),
                              itemBuilder: (context, index) {
                                if (index >= state.notifications.length) {
                                  return Padding(
                                    padding: EdgeInsets.all(context.spacing.lg),
                                    child: state.isLoadingMore
                                        ? const Center(
                                            child: CircularProgressIndicator(),
                                          )
                                        : Column(
                                            children: [
                                              if (state.hasError)
                                                const Text(
                                                  'Could not load more notifications. Your loaded notifications are still available.',
                                                ),
                                              LythButton.secondary(
                                                label: state.hasError
                                                    ? 'Retry loading'
                                                    : 'Load more',
                                                onPressed: () => ref
                                                    .read(
                                                      notificationsControllerProvider
                                                          .notifier,
                                                    )
                                                    .loadMore(),
                                              ),
                                            ],
                                          ),
                                  );
                                }

                                final notification = state.notifications[index];
                                return _NotificationCard(
                                  notification: notification,
                                  onTap: () => _handleTap(notification),
                                  onMarkRead: () => _markAsRead(notification),
                                  onDismiss: () => _dismiss(notification),
                                  busy: _pending.contains(notification.id),
                                );
                              },
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _signIn() => ReadingPane(
    child: Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: const SignInRequired(
        message: 'Sign in to view your notifications.',
        returnTo: '/notifications',
      ),
    ),
  );
}

// ============================================================================
// NOTIFICATION CARD
// ============================================================================

class _NotificationCard extends StatelessWidget {
  final models.Notification notification;
  final VoidCallback onTap;
  final Future<void> Function() onMarkRead;
  final Future<void> Function() onDismiss;
  final bool busy;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onMarkRead,
    required this.onDismiss,
    required this.busy,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final scheme = theme.colorScheme;
    final backgroundColor = notification.read
        ? scheme.surface
        : scheme.surfaceContainerLow;

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
        if (busy) return false;
        if (direction == DismissDirection.startToEnd) {
          await onMarkRead();
        } else {
          await onDismiss();
        }
        return false;
      },
      child: LythCard.clickable(
        onTap: busy ? null : onTap,
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
                        ),
                      ),
                      if (!notification.read)
                        Semantics(
                          label: 'Unread',
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: scheme.primary,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      PopupMenuButton<String>(
                        tooltip: 'Notification actions',
                        enabled: !busy,
                        onSelected: (action) async {
                          if (action == 'read') await onMarkRead();
                          if (action == 'dismiss') await onDismiss();
                        },
                        itemBuilder: (_) => [
                          if (!notification.read)
                            const PopupMenuItem(
                              value: 'read',
                              child: Text('Mark as read'),
                            ),
                          const PopupMenuItem(
                            value: 'dismiss',
                            child: Text('Dismiss notification'),
                          ),
                        ],
                      ),
                    ],
                  ),
                  SizedBox(height: spacing.xs),
                  Text(
                    notification.body,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  SizedBox(height: spacing.sm),
                  Text(
                    _formatTime(context, notification.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
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
      models.NotificationCategory.system => Icons.notifications_outlined,
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
      models.NotificationCategory.system => scheme.secondary,
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
      models.NotificationCategory.system => scheme.onSecondary,
      models.NotificationCategory.social => scheme.onPrimary,
      models.NotificationCategory.safety => scheme.onTertiary,
      models.NotificationCategory.security => scheme.onError,
      models.NotificationCategory.news => scheme.onSecondary,
      models.NotificationCategory.marketing => scheme.onSecondaryContainer,
    };
  }

  String _formatTime(BuildContext context, DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return MaterialLocalizations.of(context).formatCompactDate(time.toLocal());
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
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.all(spacing.xxxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.error_outline,
                size: 80,
                color: theme.colorScheme.error,
              ),
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
                  color: theme.colorScheme.onSurfaceVariant,
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
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.all(spacing.xxxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.notifications_none_outlined,
                size: 64,
                color: theme.colorScheme.onSurfaceVariant,
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
                  color: theme.colorScheme.onSurfaceVariant,
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
      ),
    );
  }
}

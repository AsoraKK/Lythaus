// ignore_for_file: public_member_api_docs

/// Notification Providers
///
/// Riverpod providers for notifications state management.
/// Wires screens to NotificationApiService and handles state updates.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';

// ============================================================================
// SERVICE PROVIDERS
// ============================================================================

/// Dio client provider (assumed to exist in core network layer)
/// This should be provided by the app-level dependency injection
final dioProvider = Provider<Dio>((ref) {
  return ref.watch(secureDioProvider);
});

final _notificationTokenRevisionProvider =
    StateNotifierProvider<AuthSessionRevision, int>(
      (ref) => AuthSessionRevision(ref.watch(tokenVersionProvider.notifier)),
    );

/// Notification API service provider
final notificationApiServiceProvider = Provider<NotificationApiService>((ref) {
  final revision = ref.watch(authSessionRevisionProvider);
  final tokenRevision = ref.watch(_notificationTokenRevisionProvider);
  final tokens = ref.read(_notificationTokenRevisionProvider.notifier);
  final session = ref.read(authSessionRevisionProvider.notifier);
  final ownerId = ref.watch(currentUserProvider.select((user) => user?.id));
  final dio = ref.watch(dioProvider);
  final cancelToken = CancelToken();
  final stop = session.cancelOnChange(cancelToken.cancel);
  final stopTokens = tokens.cancelOnChange(cancelToken.cancel);
  ref.onDispose(stop);
  ref.onDispose(stopTokens);
  ref.onDispose(cancelToken.cancel);
  return NotificationApiService(
    dioClient: dio,
    ownerId: ownerId,
    cancelToken: cancelToken,
    accessToken: () => ref.read(jwtProvider.future),
    isCurrentSession: () =>
        session.revision == revision && tokens.revision == tokenRevision,
  );
});

// ============================================================================
// STATE PROVIDERS
// ============================================================================

/// Notifications list state
class NotificationsState {
  final List<Notification> notifications;
  final String? continuationToken;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasError;
  final bool loadMoreFailed;
  final bool authRequired;
  final bool serviceUnavailable;
  final String? errorMessage;

  const NotificationsState({
    this.notifications = const [],
    this.continuationToken,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasError = false,
    this.loadMoreFailed = false,
    this.authRequired = false,
    this.serviceUnavailable = false,
    this.errorMessage,
  });

  NotificationsState copyWith({
    List<Notification>? notifications,
    String? Function()? continuationToken,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasError,
    bool? loadMoreFailed,
    bool? authRequired,
    bool? serviceUnavailable,
    String? Function()? errorMessage,
  }) {
    return NotificationsState(
      notifications: notifications ?? this.notifications,
      continuationToken: continuationToken != null
          ? continuationToken()
          : this.continuationToken,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      hasError: hasError ?? this.hasError,
      loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
      authRequired: authRequired ?? this.authRequired,
      serviceUnavailable: serviceUnavailable ?? this.serviceUnavailable,
      errorMessage: errorMessage != null ? errorMessage() : this.errorMessage,
    );
  }
}

/// Notifications list controller
class NotificationsController extends StateNotifier<NotificationsState> {
  final NotificationApiService _apiService;
  bool get _currentSession => mounted && _apiService.isCurrentSession;
  int _loadEpoch = 0;
  final Set<String> _readIds = {};
  final Set<String> _dismissedIds = {};
  final Set<String> _pendingActions = {};
  final Set<String> _visitedCursors = {};
  final void Function()? _onUnreadChanged;

  NotificationsController(this._apiService, {void Function()? onUnreadChanged})
    : _onUnreadChanged = onUnreadChanged,
      super(const NotificationsState());

  List<Notification> _reconcile(Iterable<Notification> notifications) {
    final byId = <String, Notification>{};
    for (final notification in notifications) {
      if (_dismissedIds.contains(notification.id)) continue;
      if (notification.read) _readIds.add(notification.id);
      byId[notification.id] = _readIds.contains(notification.id)
          ? notification.copyWith(read: true)
          : notification;
    }
    return byId.values.toList();
  }

  void _requireAuthentication() {
    ++_loadEpoch;
    state = const NotificationsState(hasError: true, authRequired: true);
  }

  /// Load initial page of notifications
  Future<void> loadNotifications() async {
    if (!_currentSession || state.authRequired) return;
    final epoch = ++_loadEpoch;
    state = state.copyWith(
      isLoading: true,
      isLoadingMore: false,
      hasError: false,
      loadMoreFailed: false,
      errorMessage: () => null,
      authRequired: false,
      serviceUnavailable: false,
    );

    try {
      final response = await _apiService.getNotifications(limit: 20);
      if (!_currentSession || epoch != _loadEpoch) return;
      state = state.copyWith(
        notifications: _reconcile(response.notifications),
        continuationToken: () => response.continuationToken,
        isLoading: false,
      );
      _visitedCursors.clear();
    } catch (e) {
      if (!_currentSession || epoch != _loadEpoch) return;
      if (e is AuthRequiredException) {
        _requireAuthentication();
        return;
      }
      state = state.copyWith(
        isLoading: false,
        hasError: true,
        errorMessage: () => e.toString(),
        serviceUnavailable: e is NotificationServiceUnavailable,
      );
    }
  }

  /// Load more notifications (pagination)
  Future<void> loadMore() async {
    if (!_currentSession ||
        state.authRequired ||
        state.isLoading ||
        state.continuationToken == null ||
        state.isLoadingMore) {
      return;
    }

    final cursor = state.continuationToken!;
    state = state.copyWith(
      isLoadingMore: true,
      hasError: false,
      loadMoreFailed: false,
      serviceUnavailable: false,
      errorMessage: () => null,
    );
    final epoch = _loadEpoch;

    try {
      final response = await _apiService.getNotifications(
        limit: 20,
        continuationToken: cursor,
      );
      if (!_currentSession || epoch != _loadEpoch) return;
      final next = response.continuationToken;
      if (next != null && (next == cursor || _visitedCursors.contains(next))) {
        throw const FormatException('Notification cursor did not advance');
      }

      state = state.copyWith(
        notifications: _reconcile([
          ...state.notifications,
          ...response.notifications,
        ]),
        continuationToken: () => response.continuationToken,
        isLoadingMore: false,
      );
      _visitedCursors.add(cursor);
    } catch (e) {
      if (!_currentSession || epoch != _loadEpoch) return;
      if (e is AuthRequiredException) {
        _requireAuthentication();
        return;
      }
      state = state.copyWith(
        isLoadingMore: false,
        hasError: true,
        loadMoreFailed: true,
        errorMessage: () => e.toString(),
        serviceUnavailable: e is NotificationServiceUnavailable,
      );
    }
  }

  /// Mark notification as read
  Future<bool> markAsRead(String notificationId) async {
    if (!_currentSession || state.authRequired) return false;
    if (_readIds.contains(notificationId)) return true;
    if (!_pendingActions.add(notificationId)) return false;
    try {
      await _apiService.markAsRead(notificationId);
      if (!_currentSession || state.authRequired) return false;
      _readIds.add(notificationId);

      // Update local state
      final updatedList = state.notifications.map((n) {
        if (n.id == notificationId) {
          return n.copyWith(read: true);
        }
        return n;
      }).toList();

      state = state.copyWith(notifications: updatedList);
      return true;
    } catch (e) {
      if (!_currentSession) return false;
      if (e is AuthRequiredException) _requireAuthentication();
      debugPrint('[Notifications] Failed to mark as read: $e');
      return false;
    } finally {
      _pendingActions.remove(notificationId);
      if (_currentSession) _onUnreadChanged?.call();
    }
  }

  /// Dismiss notification
  Future<bool> dismiss(String notificationId) async {
    if (!_currentSession || state.authRequired) return false;
    if (_dismissedIds.contains(notificationId)) return true;
    if (!_pendingActions.add(notificationId)) return false;
    try {
      await _apiService.dismissNotification(notificationId);
      if (!_currentSession || state.authRequired) return false;
      _dismissedIds.add(notificationId);

      // Remove from local state
      final updatedList = state.notifications
          .where((n) => n.id != notificationId)
          .toList();
      state = state.copyWith(notifications: updatedList);
      return true;
    } catch (e) {
      if (!_currentSession) return false;
      if (e is AuthRequiredException) _requireAuthentication();
      debugPrint('[Notifications] Failed to dismiss notification: $e');
      return false;
    } finally {
      _pendingActions.remove(notificationId);
      if (_currentSession) _onUnreadChanged?.call();
    }
  }
}

/// Notifications controller provider
final notificationsControllerProvider =
    StateNotifierProvider<NotificationsController, NotificationsState>((ref) {
      final apiService = ref.watch(notificationApiServiceProvider);
      return NotificationsController(
        apiService,
        onUnreadChanged: () => ref.invalidate(unreadCountProvider),
      );
    });

// ============================================================================
// PREFERENCES PROVIDERS
// ============================================================================

/// Preferences controller for updates
class PreferencesController
    extends StateNotifier<AsyncValue<UserNotificationPreferences>> {
  final NotificationApiService _apiService;
  bool get _currentSession => mounted && _apiService.isCurrentSession;
  int _requestEpoch = 0;
  bool _updating = false;

  PreferencesController(this._apiService) : super(const AsyncValue.loading());

  /// Load preferences
  Future<void> load() async {
    if (!_currentSession || _updating) return;
    final epoch = ++_requestEpoch;
    state = const AsyncValue.loading();
    try {
      final prefs = await _apiService.getPreferences();
      if (!_currentSession || epoch != _requestEpoch) return;
      state = AsyncValue.data(prefs);
    } catch (e, stack) {
      if (!_currentSession || epoch != _requestEpoch) return;
      state = AsyncValue.error(e, stack);
    }
  }

  /// Update preferences
  Future<void> update(UserNotificationPreferences preferences) async {
    if (!_currentSession) throw StateError('Notification session changed');
    if (_updating) {
      throw StateError('Notification preferences save in progress');
    }
    _updating = true;
    ++_requestEpoch;
    try {
      final updated = await _apiService.updatePreferences(preferences);
      if (!_currentSession) throw StateError('Notification session changed');
      state = AsyncValue.data(updated);
    } catch (e, stack) {
      if (_currentSession) state = AsyncValue.error(e, stack);
      rethrow;
    } finally {
      _updating = false;
    }
  }
}

final preferencesControllerProvider =
    StateNotifierProvider<
      PreferencesController,
      AsyncValue<UserNotificationPreferences>
    >((ref) {
      final apiService = ref.watch(notificationApiServiceProvider);
      final controller = PreferencesController(apiService);
      controller.load(); // Auto-load on creation
      return controller;
    });

// ============================================================================
// DEVICES PROVIDERS
// ============================================================================

/// Devices controller for actions
class DevicesController
    extends StateNotifier<AsyncValue<List<UserDeviceToken>>> {
  final NotificationApiService _apiService;
  bool get _currentSession => mounted && _apiService.isCurrentSession;

  DevicesController(this._apiService) : super(const AsyncValue.loading());

  /// Load devices
  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final devices = await _apiService.getDevices(activeOnly: true);
      if (!_currentSession) return;
      state = AsyncValue.data(devices);
    } catch (e, stack) {
      if (!_currentSession) return;
      state = AsyncValue.error(e, stack);
    }
  }

  /// Revoke device
  Future<void> revoke(String deviceId) async {
    try {
      await _apiService.revokeDevice(deviceId);
      if (!_currentSession) throw StateError('Notification session changed');
      // Reload devices after revoke
      await load();
    } catch (e) {
      rethrow;
    }
  }
}

final devicesControllerProvider =
    StateNotifierProvider<DevicesController, AsyncValue<List<UserDeviceToken>>>(
      (ref) {
        final apiService = ref.watch(notificationApiServiceProvider);
        final controller = DevicesController(apiService);
        controller.load(); // Auto-load on creation
        return controller;
      },
    );

// ============================================================================
// UNREAD COUNT PROVIDER
// ============================================================================

/// Unread notifications count
final unreadCountProvider = FutureProvider<int>((ref) async {
  final apiService = ref.watch(notificationApiServiceProvider);
  return apiService.getUnreadCount();
});

// ignore_for_file: public_member_api_docs

/// Notification Providers
///
/// Riverpod providers for notifications state management.
/// Wires screens to NotificationApiService and handles state updates.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
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

/// Notification API service provider
final notificationApiServiceProvider = Provider<NotificationApiService>((ref) {
  final dio = ref.watch(dioProvider);
  return NotificationApiService(dioClient: dio);
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
  final String? errorMessage;

  const NotificationsState({
    this.notifications = const [],
    this.continuationToken,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasError = false,
    this.errorMessage,
  });

  NotificationsState copyWith({
    List<Notification>? notifications,
    String? Function()? continuationToken,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasError,
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
      errorMessage: errorMessage != null ? errorMessage() : this.errorMessage,
    );
  }
}

/// Notifications list controller
class NotificationsController extends StateNotifier<NotificationsState> {
  final NotificationApiService _apiService;

  NotificationsController(this._apiService) : super(const NotificationsState());

  /// Load initial page of notifications
  Future<void> loadNotifications() async {
    state = state.copyWith(isLoading: true, hasError: false);

    try {
      final response = await _apiService.getNotifications(limit: 20);
      state = state.copyWith(
        notifications: response.notifications,
        continuationToken: () => response.continuationToken,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        hasError: true,
        errorMessage: () => e.toString(),
      );
    }
  }

  /// Load more notifications (pagination)
  Future<void> loadMore() async {
    if (state.continuationToken == null || state.isLoadingMore) return;

    state = state.copyWith(isLoadingMore: true);

    try {
      final response = await _apiService.getNotifications(
        limit: 20,
        continuationToken: state.continuationToken,
      );

      state = state.copyWith(
        notifications: [...state.notifications, ...response.notifications],
        continuationToken: () => response.continuationToken,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        hasError: true,
        errorMessage: () => e.toString(),
      );
    }
  }

  /// Mark notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await _apiService.markAsRead(notificationId);

      // Update local state
      final updatedList = state.notifications.map((n) {
        if (n.id == notificationId) {
          return n.copyWith(
            read: true,
            readAt: DateTime.now().toIso8601String(),
          );
        }
        return n;
      }).toList();

      state = state.copyWith(notifications: updatedList);
    } catch (e) {
      // Silently fail (can add error toast here)
      debugPrint('[Notifications] Failed to mark as read: $e');
    }
  }

  /// Dismiss notification
  Future<void> dismiss(String notificationId) async {
    try {
      await _apiService.dismissNotification(notificationId);

      // Remove from local state
      final updatedList = state.notifications
          .where((n) => n.id != notificationId)
          .toList();
      state = state.copyWith(notifications: updatedList);
    } catch (e) {
      debugPrint('[Notifications] Failed to dismiss notification: $e');
    }
  }
}

/// Notifications controller provider
final notificationsControllerProvider =
    StateNotifierProvider<NotificationsController, NotificationsState>((ref) {
      final apiService = ref.watch(notificationApiServiceProvider);
      return NotificationsController(apiService);
    });

// ============================================================================
// PREFERENCES PROVIDERS
// ============================================================================

/// Notification preferences state provider
final notificationPreferencesProvider =
    FutureProvider<UserNotificationPreferences>((ref) async {
      final apiService = ref.watch(notificationApiServiceProvider);
      return apiService.getPreferences();
    });

/// Preferences controller for updates
class PreferencesController
    extends StateNotifier<AsyncValue<UserNotificationPreferences>> {
  final NotificationApiService _apiService;

  PreferencesController(this._apiService) : super(const AsyncValue.loading());

  /// Load preferences
  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final prefs = await _apiService.getPreferences();
      state = AsyncValue.data(prefs);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  /// Update preferences
  Future<void> update(UserNotificationPreferences preferences) async {
    try {
      final updated = await _apiService.updatePreferences(preferences);
      state = AsyncValue.data(updated);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
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

/// Devices list provider
final devicesProvider = FutureProvider<List<UserDeviceToken>>((ref) async {
  final apiService = ref.watch(notificationApiServiceProvider);
  return apiService.getDevices(activeOnly: true);
});

/// Devices controller for actions
class DevicesController
    extends StateNotifier<AsyncValue<List<UserDeviceToken>>> {
  final NotificationApiService _apiService;

  DevicesController(this._apiService) : super(const AsyncValue.loading());

  /// Load devices
  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final devices = await _apiService.getDevices(activeOnly: true);
      state = AsyncValue.data(devices);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  /// Revoke device
  Future<void> revoke(String deviceId) async {
    try {
      await _apiService.revokeDevice(deviceId);
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

import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockNotificationApiService extends Mock
    implements NotificationApiService {}

void main() {
  setUpAll(() {
    registerFallbackValue(_samplePrefs());
  });

  group('NotificationsController', () {
    late MockNotificationApiService api;
    late NotificationsController controller;

    setUp(() {
      api = MockNotificationApiService();
      controller = NotificationsController(api);
    });

    test('loadNotifications updates state with data', () async {
      when(() => api.getNotifications(limit: any(named: 'limit'))).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            Notification(
              id: 'n1',
              userId: 'u1',
              category: NotificationCategory.social,
              eventType: NotificationEventType.commentCreated,
              title: 'Title',
              body: 'Body',
              createdAt: DateTime.utc(2024, 1, 1),
            ),
          ],
          continuationToken: 'next',
          totalUnread: 1,
        ),
      );

      await controller.loadNotifications();

      expect(controller.state.notifications.length, 1);
      expect(controller.state.continuationToken, 'next');
      expect(controller.state.isLoading, isFalse);
    });

    test('loadNotifications sets error state on failure', () async {
      when(
        () => api.getNotifications(limit: any(named: 'limit')),
      ).thenThrow(Exception('boom'));

      await controller.loadNotifications();

      expect(controller.state.hasError, isTrue);
      expect(controller.state.errorMessage, contains('boom'));
    });

    test('loadMore appends notifications when token present', () async {
      controller.state = NotificationsState(
        notifications: [
          Notification(
            id: 'n1',
            userId: 'u1',
            category: NotificationCategory.social,
            eventType: NotificationEventType.commentCreated,
            title: 'Title',
            body: 'Body',
            createdAt: DateTime.utc(2024, 1, 1),
          ),
        ],
        continuationToken: 'next',
      );

      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            Notification(
              id: 'n2',
              userId: 'u1',
              category: NotificationCategory.social,
              eventType: NotificationEventType.postLiked,
              title: 'More',
              body: 'Body',
              createdAt: DateTime.utc(2024, 1, 2),
            ),
          ],
          continuationToken: null,
          totalUnread: 0,
        ),
      );

      await controller.loadMore();

      expect(controller.state.notifications.length, 2);
      expect(controller.state.continuationToken, isNull);
    });

    test('markAsRead updates local state', () async {
      controller.state = NotificationsState(
        notifications: [
          Notification(
            id: 'n1',
            userId: 'u1',
            category: NotificationCategory.social,
            eventType: NotificationEventType.commentCreated,
            title: 'Title',
            body: 'Body',
            createdAt: DateTime.utc(2024, 1, 1),
          ),
        ],
      );

      when(() => api.markAsRead('n1')).thenAnswer((_) async {});

      await controller.markAsRead('n1');

      expect(controller.state.notifications.first.read, isTrue);
      expect(controller.state.notifications.first.readAt, isNotNull);
    });

    test('dismiss removes notification from state', () async {
      controller.state = NotificationsState(
        notifications: [
          Notification(
            id: 'n1',
            userId: 'u1',
            category: NotificationCategory.social,
            eventType: NotificationEventType.commentCreated,
            title: 'Title',
            body: 'Body',
            createdAt: DateTime.utc(2024, 1, 1),
          ),
          Notification(
            id: 'n2',
            userId: 'u1',
            category: NotificationCategory.news,
            eventType: NotificationEventType.newsAlert,
            title: 'News',
            body: 'Body',
            createdAt: DateTime.utc(2024, 1, 2),
          ),
        ],
      );

      when(() => api.dismissNotification('n1')).thenAnswer((_) async {});

      await controller.dismiss('n1');

      expect(controller.state.notifications.length, 1);
      expect(controller.state.notifications.first.id, 'n2');
    });
  });

  group('PreferencesController', () {
    late MockNotificationApiService api;
    late PreferencesController controller;

    setUp(() {
      api = MockNotificationApiService();
      controller = PreferencesController(api);
    });

    test('load populates state from API', () async {
      final prefs = UserNotificationPreferences(
        userId: 'u1',
        timezone: 'UTC',
        quietHours: QuietHours.defaultQuietHours,
        categories: const CategoryPreferences(
          social: true,
          news: false,
          marketing: false,
        ),
        updatedAt: DateTime.utc(2024, 1, 1),
      );

      when(() => api.getPreferences()).thenAnswer((_) async => prefs);

      await controller.load();

      expect(controller.state.value, prefs);
    });

    test('update writes state and returns new data', () async {
      final prefs = UserNotificationPreferences(
        userId: 'u1',
        timezone: 'UTC',
        quietHours: QuietHours.defaultQuietHours,
        categories: const CategoryPreferences(
          social: true,
          news: false,
          marketing: false,
        ),
        updatedAt: DateTime.utc(2024, 1, 1),
      );

      final updated = prefs.copyWith(
        categories: prefs.categories.copyWith(marketing: true),
      );

      when(() => api.updatePreferences(any())).thenAnswer((_) async => updated);

      await controller.update(updated);

      expect(controller.state.value?.categories.marketing, isTrue);
    });

    test('update surfaces errors', () async {
      when(() => api.updatePreferences(any())).thenThrow(Exception('boom'));

      await expectLater(controller.update(_samplePrefs()), throwsException);
      expect(controller.state.hasError, isTrue);
    });
  });

  group('DevicesController', () {
    late MockNotificationApiService api;
    late DevicesController controller;

    setUp(() {
      api = MockNotificationApiService();
      controller = DevicesController(api);
    });

    test('load updates device list', () async {
      final devices = [
        UserDeviceToken(
          id: 'd1',
          userId: 'u1',
          deviceId: 'device-1',
          pushToken: 'token',
          platform: 'fcm',
          createdAt: DateTime.utc(2024, 1, 1),
          lastSeenAt: DateTime.utc(2024, 1, 1),
        ),
      ];

      when(
        () => api.getDevices(activeOnly: true),
      ).thenAnswer((_) async => devices);

      await controller.load();

      expect(controller.state.value?.length, 1);
    });

    test('revoke triggers reload', () async {
      when(() => api.revokeDevice('d1')).thenAnswer((_) async {});
      when(() => api.getDevices(activeOnly: true)).thenAnswer((_) async => []);

      await controller.revoke('d1');

      verify(() => api.revokeDevice('d1')).called(1);
      verify(() => api.getDevices(activeOnly: true)).called(1);
      expect(controller.state.value, isEmpty);
    });
  });

  group('Provider wiring', () {
    test(
      'notification preferences and unread count providers call API',
      () async {
        final api = MockNotificationApiService();
        final prefs = _samplePrefs();

        when(() => api.getPreferences()).thenAnswer((_) async => prefs);
        when(() => api.getUnreadCount()).thenAnswer((_) async => 5);

        final container = ProviderContainer(
          overrides: [notificationApiServiceProvider.overrideWithValue(api)],
        );
        addTearDown(container.dispose);

        final loadedPrefs = await container.read(
          notificationPreferencesProvider.future,
        );
        final unread = await container.read(unreadCountProvider.future);

        expect(loadedPrefs.userId, 'u1');
        expect(unread, 5);
      },
    );
  });
}

UserNotificationPreferences _samplePrefs() {
  return UserNotificationPreferences(
    userId: 'u1',
    timezone: 'UTC',
    quietHours: QuietHours.defaultQuietHours,
    categories: const CategoryPreferences(
      social: true,
      news: false,
      marketing: false,
    ),
    updatedAt: DateTime.utc(2024, 1, 1),
  );
}

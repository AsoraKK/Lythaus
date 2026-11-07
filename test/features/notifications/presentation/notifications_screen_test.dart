import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart'
    as models;
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'dart:async';

class MockNotificationApiService extends Mock
    implements NotificationApiService {
  @override
  bool get isCurrentSession => true;
}

Widget _buildTestWidget({
  required NotificationApiService api,
  required Widget child,
}) {
  return ProviderScope(
    overrides: [notificationApiServiceProvider.overrideWithValue(api)],
    child: MaterialApp(home: child),
  );
}

models.Notification _notification({
  required String id,
  bool read = false,
  String? nativeType,
  String? deeplink,
}) {
  return models.Notification(
    id: id,
    userId: 'u1',
    category: models.NotificationCategory.social,
    eventType: models.NotificationEventType.commentCreated,
    title: 'Title $id',
    body: 'Body $id',
    read: read,
    nativeType: nativeType,
    deeplink: deeplink,
    createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
  );
}

void main() {
  group('NotificationsScreen', () {
    testWidgets('embedded sign-in preserves the shell route and query', (
      tester,
    ) async {
      final active = ValueNotifier(true);
      addTearDown(active.dispose);
      final router = GoRouter(
        initialLocation: '/?tab=notifications&feed=custom&source=fixture',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => NotificationsScreen(activeListenable: active),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [guestModeProvider.overrideWith((ref) => true)],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SignInRequired>(find.byType(SignInRequired)).returnTo,
        '/?tab=notifications&feed=custom&source=fixture',
      );
    });

    testWidgets('standalone sign-in keeps its existing return route', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [guestModeProvider.overrideWith((ref) => true)],
          child: const MaterialApp(home: NotificationsScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SignInRequired>(find.byType(SignInRequired)).returnTo,
        '/notifications',
      );
    });

    testWidgets('embedded sign-in has a shell fallback without GoRouter', (
      tester,
    ) async {
      final active = ValueNotifier(true);
      addTearDown(active.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [guestModeProvider.overrideWith((ref) => true)],
          child: MaterialApp(
            home: NotificationsScreen(activeListenable: active),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SignInRequired>(find.byType(SignInRequired)).returnTo,
        '/?tab=notifications',
      );
    });

    testWidgets('groups loaded replies and review events by their real type', (
      tester,
    ) async {
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            _notification(id: 'reply', nativeType: 'content.reply_received'),
            _notification(id: 'review', nativeType: 'appeals.appeal_resolved'),
            _notification(id: 'other', nativeType: 'social.follow_received'),
          ],
          continuationToken: 'next',
          totalUnread: 3,
        ),
      );
      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review'));
      await tester.pumpAndSettle();

      expect(find.text('Title review'), findsOneWidget);
      expect(find.text('Title reply'), findsNothing);
      expect(find.text('Title other'), findsNothing);
      expect(find.text('Showing loaded notifications only.'), findsOneWidget);
      expect(find.text('Load more'), findsOneWidget);

      await tester.tap(find.text('Replies'));
      await tester.pumpAndSettle();
      expect(find.text('Title reply'), findsOneWidget);
      expect(find.text('Title review'), findsNothing);
    });

    testWidgets('unknown legacy events stay out of the replies filter', (
      tester,
    ) async {
      final unknown = models.Notification.fromJson({
        'id': 'future-event',
        'userId': 'u1',
        'category': 'SOCIAL',
        'eventType': 'FUTURE_EVENT',
        'title': 'Future update',
        'body': 'A synthetic update',
        'createdAt': DateTime.utc(2026).toIso8601String(),
      });
      expect(unknown.eventType, models.NotificationEventType.commentCreated);
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            models.Notification.fromJson(unknown.copyWith(read: true).toJson()),
          ],
          totalUnread: 0,
        ),
      );
      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Replies'));
      await tester.pumpAndSettle();
      expect(find.text('Future update'), findsNothing);
      await tester.tap(find.text('Other'));
      await tester.pumpAndSettle();
      expect(find.text('Future update'), findsOneWidget);
    });

    testWidgets('a late read receipt cannot navigate after tab deactivation', (
      tester,
    ) async {
      final api = MockNotificationApiService();
      final pending = Completer<void>();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            _notification(id: 'n1', deeplink: '/settings/notifications'),
          ],
          totalUnread: 1,
        ),
      );
      when(() => api.markAsRead('n1')).thenAnswer((_) => pending.future);
      var active = true;
      late StateSetter setActive;
      await tester.pumpWidget(
        _buildTestWidget(
          api: api,
          child: StatefulBuilder(
            builder: (context, setState) {
              setActive = setState;
              return NotificationsScreen(isActive: active);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Title n1'));
      await tester.pump();
      setActive(() => active = false);
      await tester.pump();
      setActive(() => active = true);
      await tester.pump();
      pending.complete();
      await tester.pumpAndSettle();

      expect(find.byType(NotificationsSettingsScreen), findsNothing);
      expect(find.byType(NotificationsScreen), findsOneWidget);
      verify(() => api.markAsRead('n1')).called(1);
    });

    testWidgets('tab notifier fences a receipt before the next frame', (
      tester,
    ) async {
      final api = MockNotificationApiService();
      final pending = Completer<void>();
      final active = ValueNotifier(true);
      addTearDown(active.dispose);
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            _notification(id: 'n1', deeplink: '/settings/notifications'),
          ],
          totalUnread: 1,
        ),
      );
      when(() => api.markAsRead('n1')).thenAnswer((_) => pending.future);
      await tester.pumpWidget(
        _buildTestWidget(
          api: api,
          child: NotificationsScreen(activeListenable: active),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Title n1'));
      await tester.pump();
      active.value = false;
      active.value = true;
      pending.complete();
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsSettingsScreen), findsNothing);
      expect(find.byType(NotificationsScreen), findsOneWidget);
      verify(() => api.markAsRead('n1')).called(1);
    });

    testWidgets('filters remain usable at narrow width and large text', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(320, 960));
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(() => tester.binding.setSurfaceSize(null));
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [
            _notification(id: 'review', nativeType: 'appeal_result'),
          ],
          totalUnread: 1,
        ),
      );
      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Review'));
      await tester.tap(find.text('Review'));
      await tester.pumpAndSettle();
      expect(find.text('Title review'), findsOneWidget);
      expect(find.byTooltip('Notification settings'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows empty state when no notifications', (tester) async {
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => const NotificationsListResponse(
          notifications: [],
          continuationToken: null,
          totalUnread: 0,
        ),
      );

      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('No Notifications'), findsOneWidget);
      expect(find.text('Refresh'), findsOneWidget);
    });

    testWidgets('shows error state on failure', (tester) async {
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenThrow(Exception('network down'));

      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
    });

    testWidgets('renders list and marks read on tap', (tester) async {
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [_notification(id: 'n1')],
          continuationToken: 'next',
          totalUnread: 1,
        ),
      );
      when(() => api.markAsRead(any())).thenAnswer((_) async {});

      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Title n1'), findsOneWidget);
      expect(find.text('Mark loaded read'), findsOneWidget);

      await tester.tap(find.text('Title n1'));
      await tester.pump(const Duration(milliseconds: 50));

      verify(() => api.markAsRead('n1')).called(1);
      expect(find.text('Load more'), findsOneWidget);
      expect(
        find.text('This notification has no available destination.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'bulk read waits for confirmation and reports partial failure',
      (tester) async {
        final api = MockNotificationApiService();
        final pending = Completer<void>();
        when(
          () => api.getNotifications(
            limit: any(named: 'limit'),
            continuationToken: any(named: 'continuationToken'),
          ),
        ).thenAnswer(
          (_) async => NotificationsListResponse(
            notifications: [
              _notification(id: 'n1'),
              _notification(id: 'n2'),
            ],
            totalUnread: 2,
          ),
        );
        when(() => api.markAsRead('n1')).thenAnswer((_) => pending.future);
        when(
          () => api.markAsRead('n2'),
        ).thenThrow(Exception('private infrastructure detail'));
        await tester.pumpWidget(
          _buildTestWidget(api: api, child: const NotificationsScreen()),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Mark loaded read'));
        await tester.pump();
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(
          find.byWidgetPredicate(
            (widget) =>
                widget is Semantics && widget.properties.label == 'Unread',
          ),
          findsNWidgets(2),
        );
        pending.complete();
        await tester.pumpAndSettle();
        expect(
          find.byWidgetPredicate(
            (widget) =>
                widget is Semantics && widget.properties.label == 'Unread',
          ),
          findsOneWidget,
        );
        expect(
          find.text(
            'Some notifications could not be marked as read. Please try again.',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('private infrastructure'), findsNothing);
        verify(() => api.markAsRead('n1')).called(1);
        verify(() => api.markAsRead('n2')).called(1);
      },
    );

    testWidgets(
      'failed dismissal retains the notification and offers recovery',
      (tester) async {
        final api = MockNotificationApiService();
        when(
          () => api.getNotifications(
            limit: any(named: 'limit'),
            continuationToken: any(named: 'continuationToken'),
          ),
        ).thenAnswer(
          (_) async => NotificationsListResponse(
            notifications: [_notification(id: 'n1')],
            totalUnread: 1,
          ),
        );
        when(
          () => api.dismissNotification('n1'),
        ).thenThrow(Exception('offline'));
        await tester.pumpWidget(
          _buildTestWidget(api: api, child: const NotificationsScreen()),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Notification actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Dismiss notification'));
        await tester.pumpAndSettle();
        expect(find.text('Title n1'), findsOneWidget);
        expect(
          find.text(
            'Could not confirm dismissal. Please refresh or try again.',
          ),
          findsOneWidget,
        );
        verify(() => api.dismissNotification('n1')).called(1);
      },
    );

    testWidgets('pagination failure keeps loaded rows and a retry action', (
      tester,
    ) async {
      final api = MockNotificationApiService();
      when(() => api.getNotifications(limit: 20)).thenAnswer(
        (_) async => NotificationsListResponse(
          notifications: [_notification(id: 'n1')],
          continuationToken: 'next',
          totalUnread: 1,
        ),
      );
      when(
        () => api.getNotifications(limit: 20, continuationToken: 'next'),
      ).thenThrow(Exception('private response body'));
      await tester.pumpWidget(
        _buildTestWidget(api: api, child: const NotificationsScreen()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Title n1'), findsOneWidget);
      expect(find.text('Retry loading'), findsOneWidget);
      expect(find.textContaining('private response'), findsNothing);
    });

    testWidgets('empty state remains usable at narrow width and large text', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = MockNotificationApiService();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenAnswer(
        (_) async =>
            const NotificationsListResponse(notifications: [], totalUnread: 0),
      );
      await tester.pumpWidget(
        _buildTestWidget(
          api: api,
          child: const MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(2)),
            child: NotificationsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Refresh'), findsOneWidget);
    });
  });
}

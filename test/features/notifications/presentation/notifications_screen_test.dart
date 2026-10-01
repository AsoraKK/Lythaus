import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart'
    as models;
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'dart:async';

class MockNotificationApiService extends Mock
    implements NotificationApiService {}

Widget _buildTestWidget({
  required NotificationApiService api,
  required Widget child,
}) {
  return ProviderScope(
    overrides: [notificationApiServiceProvider.overrideWithValue(api)],
    child: MaterialApp(home: child),
  );
}

models.Notification _notification({required String id, bool read = false}) {
  return models.Notification(
    id: id,
    userId: 'u1',
    category: models.NotificationCategory.social,
    eventType: models.NotificationEventType.commentCreated,
    title: 'Title $id',
    body: 'Body $id',
    read: read,
    createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
  );
}

void main() {
  group('NotificationsScreen', () {
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
      expect(find.text('Mark all read'), findsOneWidget);

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
        await tester.tap(find.text('Mark all read'));
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
          find.text('Could not dismiss this notification. Please try again.'),
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

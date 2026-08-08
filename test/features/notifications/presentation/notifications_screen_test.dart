import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart'
    as models;
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

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
      expect(find.byType(CircularProgressIndicator), findsWidgets);
    });
  });
}

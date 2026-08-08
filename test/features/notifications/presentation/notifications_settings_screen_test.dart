import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockNotificationApiService extends Mock
    implements NotificationApiService {}

Widget _buildTestWidget({required NotificationApiService api}) {
  return ProviderScope(
    overrides: [notificationApiServiceProvider.overrideWithValue(api)],
    child: const MaterialApp(home: NotificationsSettingsScreen()),
  );
}

Future<void> _scrollToDevices(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.text('Devices'),
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

UserNotificationPreferences _samplePreferences() {
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

UserDeviceToken _sampleDevice() {
  return UserDeviceToken(
    id: 'd1',
    userId: 'u1',
    deviceId: 'device-1',
    pushToken: 'token',
    platform: 'fcm',
    label: 'Pixel',
    createdAt: DateTime.utc(2024, 1, 1),
    lastSeenAt: DateTime.utc(2024, 1, 1, 1),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(_samplePreferences());
  });

  group('NotificationsSettingsScreen', () {
    testWidgets('renders sections and device card', (tester) async {
      final api = MockNotificationApiService();
      when(
        () => api.getPreferences(),
      ).thenAnswer((_) async => _samplePreferences());
      when(
        () => api.getDevices(activeOnly: true),
      ).thenAnswer((_) async => [_sampleDevice()]);

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      expect(find.text('Categories'), findsOneWidget);
      expect(find.text('Quiet Hours'), findsOneWidget);

      await _scrollToDevices(tester);

      expect(find.text('Devices'), findsOneWidget);
      expect(find.text('Pixel'), findsOneWidget);
    });

    testWidgets('toggles category and shows success snackbar', (tester) async {
      final api = MockNotificationApiService();
      final prefs = _samplePreferences();
      final updated = prefs.copyWith(
        categories: prefs.categories.copyWith(marketing: true),
      );

      when(() => api.getPreferences()).thenAnswer((_) async => prefs);
      when(
        () => api.getDevices(activeOnly: true),
      ).thenAnswer((_) async => [_sampleDevice()]);
      when(() => api.updatePreferences(any())).thenAnswer((_) async => updated);

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(SwitchListTile, 'Marketing'));
      await tester.pumpAndSettle();

      verify(() => api.updatePreferences(any())).called(1);
      expect(find.text('Preferences updated'), findsOneWidget);
    });

    testWidgets('quiet hours toggle updates preferences', (tester) async {
      final api = MockNotificationApiService();
      final prefs = _samplePreferences();

      when(() => api.getPreferences()).thenAnswer((_) async => prefs);
      when(
        () => api.getDevices(activeOnly: true),
      ).thenAnswer((_) async => [_sampleDevice()]);
      when(() => api.updatePreferences(any())).thenAnswer((_) async => prefs);

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('01'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('01'));
      await tester.pump(const Duration(milliseconds: 50));

      verify(() => api.updatePreferences(any())).called(1);
    });

    testWidgets('removes device and shows snackbar', (tester) async {
      final api = MockNotificationApiService();
      var deviceCalls = 0;

      when(
        () => api.getPreferences(),
      ).thenAnswer((_) async => _samplePreferences());
      when(() => api.getDevices(activeOnly: true)).thenAnswer((_) async {
        deviceCalls++;
        if (deviceCalls == 1) {
          return [_sampleDevice()];
        }
        return [];
      });
      when(() => api.revokeDevice('d1')).thenAnswer((_) async {});

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      await _scrollToDevices(tester);

      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();

      verify(() => api.revokeDevice('d1')).called(1);
      expect(find.text('Device removed'), findsOneWidget);
    });

    testWidgets('shows retry when preferences fail to load', (tester) async {
      final api = MockNotificationApiService();
      when(() => api.getPreferences()).thenThrow(Exception('boom'));
      when(
        () => api.getDevices(activeOnly: true),
      ).thenAnswer((_) async => [_sampleDevice()]);

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      verify(() => api.getPreferences()).called(greaterThan(1));
    });

    testWidgets('shows empty devices message', (tester) async {
      final api = MockNotificationApiService();
      when(
        () => api.getPreferences(),
      ).thenAnswer((_) async => _samplePreferences());
      when(() => api.getDevices(activeOnly: true)).thenAnswer((_) async => []);

      await tester.pumpWidget(_buildTestWidget(api: api));
      await tester.pumpAndSettle();

      await _scrollToDevices(tester);

      expect(find.text('No devices registered'), findsOneWidget);
    });
  });
}

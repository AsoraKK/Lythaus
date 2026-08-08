import 'package:lythaus/services/moderation_service.dart';
import 'package:lythaus/services/post_service.dart';
import 'package:lythaus/services/push/device_token_service.dart';
import 'package:lythaus/services/push/push_notification_service.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockPushNotificationService extends Mock
    implements PushNotificationService {}

void main() {
  test('service providers create expected instances', () {
    final mockPush = _MockPushNotificationService();
    final container = ProviderContainer(
      overrides: [
        secureDioProvider.overrideWithValue(Dio()),
        pushNotificationServiceProvider.overrideWithValue(mockPush),
      ],
    );
    addTearDown(container.dispose);

    expect(container.read(secureStorageProvider), isNotNull);
    expect(container.read(postServiceProvider), isA<PostService>());
    expect(container.read(moderationServiceProvider), isA<ModerationClient>());
    expect(
      container.read(deviceTokenServiceProvider),
      isA<DeviceTokenService>(),
    );
  });
}

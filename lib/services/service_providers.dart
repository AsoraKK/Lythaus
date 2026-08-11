// ignore_for_file: public_member_api_docs

/// LYTHAUS SERVICE PROVIDERS
///
/// Purpose: Riverpod providers for dependency injection.
/// Architecture: Clean service layer architecture.
library;

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/services/push/device_token_service.dart';
import 'package:lythaus/services/push/push_notification_service.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Flutter secure storage provider.
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

/// Push notification service provider (singleton).
final pushNotificationServiceProvider = Provider<PushNotificationService>((
  ref,
) {
  return PushNotificationService();
});

/// Device token service provider.
final deviceTokenServiceProvider = Provider<DeviceTokenService>((ref) {
  final dio = ref.watch(secureDioProvider);
  final pushService = ref.watch(pushNotificationServiceProvider);
  final storage = ref.watch(secureStorageProvider);

  return DeviceTokenService(
    dioClient: dio,
    pushService: pushService,
    storage: storage,
  );
});

/// Subscription service provider (backend-only until IAP is wired).
final subscriptionServiceProvider = Provider<BackendSubscriptionService>((ref) {
  final dio = ref.watch(secureDioProvider);
  return BackendSubscriptionService(dio: dio);
});

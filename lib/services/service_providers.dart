// ignore_for_file: public_member_api_docs

/// LYTHAUS SERVICE PROVIDERS
///
/// Purpose: Riverpod providers for dependency injection.
/// Architecture: Clean service layer architecture.
library;

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/services/moderation_service.dart';
import 'package:lythaus/services/post_service.dart';
import 'package:lythaus/services/push/device_token_service.dart';
import 'package:lythaus/services/push/push_notification_service.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Flutter secure storage provider.
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

/// Post service provider.
final postServiceProvider = Provider<PostService>((ref) {
  final dio = ref.watch(secureDioProvider);
  return PostService(dio);
});

/// Moderation service provider.
final moderationServiceProvider = Provider<ModerationClient>((ref) {
  final dio = ref.watch(secureDioProvider);
  return ModerationClient(dio);
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

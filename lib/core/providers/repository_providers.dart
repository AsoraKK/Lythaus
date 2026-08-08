/// LYTHAUS REPOSITORY PROVIDERS
///
/// 🎯 Purpose: Centralized repository providers following Dependency Inversion Principle
/// 🏗️ Architecture: Core layer - provides shared repository abstractions
/// 🔐 Dependency Rule: UI layer → Application layer → Domain layer
/// 📱 Platform: Flutter with Riverpod for dependency injection
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/feed/domain/feed_repository.dart';
import 'package:lythaus/features/feed/application/feed_service.dart';
import 'package:lythaus/core/security/cert_pinning.dart';

/// **Core HTTP Client Provider**
///
/// Centralized Dio instance for the native Lythaus API.
///
/// Native platforms use certificate pinning; web keeps Dio's browser adapter.
/// Used by all repository implementations for consistency
final httpClientProvider = Provider<Dio>((ref) {
  final baseUrl = _resolveFunctionBaseUrl();

  // Create Dio with certificate pinning enabled
  final dio = createPinnedDio(baseUrl: baseUrl);

  // Configure timeouts and headers
  dio.options.connectTimeout = const Duration(seconds: 10);
  dio.options.receiveTimeout = const Duration(seconds: 10);
  dio.options.headers.addAll({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });

  return dio;
});

String _resolveFunctionBaseUrl() {
  return EnvironmentConfig.fromEnvironment().apiBaseUrl;
}

/// **Moderation Repository Provider**
///
/// Provides ModerationRepository implementation with proper dependency injection
/// UI components should depend on this, not on concrete services
final moderationRepositoryProvider = Provider<ModerationRepository>((ref) {
  final dio = ref.watch(httpClientProvider);
  return ModerationService(dio);
});

/// **Feed Repository Provider**
///
/// Provides FeedRepository implementation with proper dependency injection
/// UI components should depend on this, not on concrete services
final feedRepositoryProvider = Provider<FeedRepository>((ref) {
  final dio = ref.watch(httpClientProvider);
  return FeedService(dio);
});

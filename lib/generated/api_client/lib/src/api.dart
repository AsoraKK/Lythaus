//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

import 'package:dio/dio.dart';
import 'package:built_value/serializer.dart';
import 'package:lythaus_api_client/src/serializers.dart';
import 'package:lythaus_api_client/src/auth/api_key_auth.dart';
import 'package:lythaus_api_client/src/auth/basic_auth.dart';
import 'package:lythaus_api_client/src/auth/bearer_auth.dart';
import 'package:lythaus_api_client/src/api/admin_api.dart';
import 'package:lythaus_api_client/src/api/analytics_api.dart';
import 'package:lythaus_api_client/src/api/appeals_api.dart';
import 'package:lythaus_api_client/src/api/auth_api.dart';
import 'package:lythaus_api_client/src/api/custom_feeds_api.dart';
import 'package:lythaus_api_client/src/api/feed_api.dart';
import 'package:lythaus_api_client/src/api/health_api.dart';
import 'package:lythaus_api_client/src/api/moderation_api.dart';
import 'package:lythaus_api_client/src/api/notifications_api.dart';
import 'package:lythaus_api_client/src/api/payments_api.dart';
import 'package:lythaus_api_client/src/api/posts_api.dart';
import 'package:lythaus_api_client/src/api/privacy_api.dart';
import 'package:lythaus_api_client/src/api/privacy_admin_api.dart';
import 'package:lythaus_api_client/src/api/reactions_api.dart';
import 'package:lythaus_api_client/src/api/reputation_api.dart';
import 'package:lythaus_api_client/src/api/rewards_api.dart';
import 'package:lythaus_api_client/src/api/subscription_api.dart';
import 'package:lythaus_api_client/src/api/users_api.dart';

class LythausApiClient {
  static const String basePath = r'https://api.lythaus.co/api';

  final Dio dio;
  final Serializers serializers;

  LythausApiClient({
    Dio? dio,
    Serializers? serializers,
    String? basePathOverride,
    List<Interceptor>? interceptors,
  })  : this.serializers = serializers ?? standardSerializers,
        this.dio = dio ??
            Dio(BaseOptions(
              baseUrl: basePathOverride ?? basePath,
              connectTimeout: const Duration(milliseconds: 5000),
              receiveTimeout: const Duration(milliseconds: 3000),
            )) {
    if (interceptors == null) {
      this.dio.interceptors.addAll([
        BasicAuthInterceptor(),
        BearerAuthInterceptor(),
        ApiKeyAuthInterceptor(),
      ]);
    } else {
      this.dio.interceptors.addAll(interceptors);
    }
  }


  void setBearerAuth(String name, String token) {
    if (this.dio.interceptors.any((i) => i is BearerAuthInterceptor)) {
      (this.dio.interceptors.firstWhere((i) => i is BearerAuthInterceptor) as BearerAuthInterceptor).tokens[name] = token;
    }
  }

  void setBasicAuth(String name, String username, String password) {
    if (this.dio.interceptors.any((i) => i is BasicAuthInterceptor)) {
      (this.dio.interceptors.firstWhere((i) => i is BasicAuthInterceptor) as BasicAuthInterceptor).authInfo[name] = BasicAuthInfo(username, password);
    }
  }

  void setApiKey(String name, String apiKey) {
    if (this.dio.interceptors.any((i) => i is ApiKeyAuthInterceptor)) {
      (this.dio.interceptors.firstWhere((element) => element is ApiKeyAuthInterceptor) as ApiKeyAuthInterceptor).apiKeys[name] = apiKey;
    }
  }

  /// Get AdminApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  AdminApi getAdminApi() {
    return AdminApi(dio, serializers);
  }

  /// Get AnalyticsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  AnalyticsApi getAnalyticsApi() {
    return AnalyticsApi(dio, serializers);
  }

  /// Get AppealsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  AppealsApi getAppealsApi() {
    return AppealsApi(dio, serializers);
  }

  /// Get AuthApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  AuthApi getAuthApi() {
    return AuthApi(dio, serializers);
  }

  /// Get CustomFeedsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  CustomFeedsApi getCustomFeedsApi() {
    return CustomFeedsApi(dio, serializers);
  }

  /// Get FeedApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  FeedApi getFeedApi() {
    return FeedApi(dio, serializers);
  }

  /// Get HealthApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  HealthApi getHealthApi() {
    return HealthApi(dio, serializers);
  }

  /// Get ModerationApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  ModerationApi getModerationApi() {
    return ModerationApi(dio, serializers);
  }

  /// Get NotificationsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  NotificationsApi getNotificationsApi() {
    return NotificationsApi(dio, serializers);
  }

  /// Get PaymentsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  PaymentsApi getPaymentsApi() {
    return PaymentsApi(dio, serializers);
  }

  /// Get PostsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  PostsApi getPostsApi() {
    return PostsApi(dio, serializers);
  }

  /// Get PrivacyApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  PrivacyApi getPrivacyApi() {
    return PrivacyApi(dio, serializers);
  }

  /// Get PrivacyAdminApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  PrivacyAdminApi getPrivacyAdminApi() {
    return PrivacyAdminApi(dio, serializers);
  }

  /// Get ReactionsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  ReactionsApi getReactionsApi() {
    return ReactionsApi(dio, serializers);
  }

  /// Get ReputationApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  ReputationApi getReputationApi() {
    return ReputationApi(dio, serializers);
  }

  /// Get RewardsApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  RewardsApi getRewardsApi() {
    return RewardsApi(dio, serializers);
  }

  /// Get SubscriptionApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  SubscriptionApi getSubscriptionApi() {
    return SubscriptionApi(dio, serializers);
  }

  /// Get UsersApi instance, base route and serializer can be overridden by a given but be careful,
  /// by doing that all interceptors will not be executed
  UsersApi getUsersApi() {
    return UsersApi(dio, serializers);
  }
}

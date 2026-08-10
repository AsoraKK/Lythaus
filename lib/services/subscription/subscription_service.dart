// ignore_for_file: public_member_api_docs

/// LYTHAUS SUBSCRIPTION SERVICE
///
/// Architecture-only interface for future IAP/payment integration.
/// Defines the contract the app will use to check subscription status,
/// start purchases, and restore previous purchases.
///
/// When a payment provider is chosen, implement this interface with
/// provider-specific logic (RevenueCat SDK, StoreKit 2, Google Billing Library).
library;

import 'package:dio/dio.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────────────────────────────────────

/// Active subscription status returned by the backend
class SubscriptionStatus {
  final String userId;
  final String tier;
  final String status;
  final String? provider;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final String accessLabel;
  final DateTime? manualGrantExpiresAt;
  final DateTime? manualGrantReviewAt;
  final SubscriptionEntitlements entitlements;

  const SubscriptionStatus({
    required this.userId,
    required this.tier,
    required this.status,
    this.provider,
    this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    this.accessLabel = 'Alpha access',
    this.manualGrantExpiresAt,
    this.manualGrantReviewAt,
    required this.entitlements,
  });

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) {
    final rawEntitlements = json['entitlements'];
    return SubscriptionStatus(
      userId: json['userId']?.toString() ?? '',
      tier: json['tier']?.toString() ?? 'free',
      status: json['status']?.toString() ?? 'active',
      provider: json['provider'] as String?,
      currentPeriodEnd: json['currentPeriodEnd'] != null
          ? DateTime.parse(json['currentPeriodEnd'] as String)
          : null,
      cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool? ?? false,
      accessLabel: json['accessLabel'] as String? ?? 'Alpha access',
      manualGrantExpiresAt: json['manualGrantExpiresAt'] != null
          ? DateTime.parse(json['manualGrantExpiresAt'] as String)
          : null,
      manualGrantReviewAt: json['manualGrantReviewAt'] != null
          ? DateTime.parse(json['manualGrantReviewAt'] as String)
          : null,
      entitlements: SubscriptionEntitlements.fromJson(
        rawEntitlements is Map
            ? Map<String, dynamic>.from(rawEntitlements)
            : const <String, dynamic>{},
      ),
    );
  }

  /// Whether the user has an active paid subscription
  bool get isPaid => tier != 'free' && status == 'active';

  /// Whether the subscription is about to expire
  bool get isExpiring =>
      cancelAtPeriodEnd &&
      currentPeriodEnd != null &&
      currentPeriodEnd!.isAfter(DateTime.now());
}

/// Tier-based entitlements derived from the subscription
class SubscriptionEntitlements {
  final int dailyPosts;
  final int dailyComments;
  final int dailyReactions;
  final int dailyAppeals;
  final int exportCooldownDays;
  final int maxMediaSizeMB;
  final int maxMediaPerPost;
  final int maxCustomFeeds;
  final String newsBoardAccessLevel;
  final bool newsBoardPreview;
  final bool postingRestricted;
  final int rewardLevelCap;
  final int? rewardOptionsPerLevel;
  final String rewardChoiceBreadth;

  const SubscriptionEntitlements({
    required this.dailyPosts,
    required this.dailyComments,
    required this.dailyReactions,
    required this.dailyAppeals,
    required this.exportCooldownDays,
    required this.maxMediaSizeMB,
    required this.maxMediaPerPost,
    required this.maxCustomFeeds,
    required this.newsBoardAccessLevel,
    required this.newsBoardPreview,
    required this.postingRestricted,
    required this.rewardLevelCap,
    required this.rewardOptionsPerLevel,
    required this.rewardChoiceBreadth,
  });

  factory SubscriptionEntitlements.fromJson(Map<String, dynamic> json) {
    return SubscriptionEntitlements(
      dailyPosts: _asInt(json['dailyPosts']),
      dailyComments: _asInt(json['dailyComments']),
      dailyReactions: _asInt(json['dailyReactions']),
      dailyAppeals: _asInt(json['dailyAppeals']),
      exportCooldownDays: _asInt(json['exportCooldownDays'], fallback: 30),
      maxMediaSizeMB: _asInt(json['maxMediaSizeMB']),
      maxMediaPerPost: _asInt(json['maxMediaPerPost']),
      maxCustomFeeds: _asInt(json['maxCustomFeeds'], fallback: 1),
      newsBoardAccessLevel:
          json['newsBoardAccess']?.toString() ??
          json['newsBoardAccessLevel']?.toString() ??
          'none',
      newsBoardPreview: json['newsBoardPreview'] as bool? ?? false,
      postingRestricted: json['postingRestricted'] as bool? ?? false,
      rewardLevelCap: _asInt(json['rewardLevelCap']),
      rewardOptionsPerLevel: json['rewardOptionsPerLevel'] == null
          ? null
          : _asInt(json['rewardOptionsPerLevel']),
      rewardChoiceBreadth: json['rewardChoiceBreadth'] as String? ?? 'limited',
    );
  }
}

/// Result of a purchase attempt
sealed class PurchaseResult {
  const PurchaseResult();
}

class PurchaseSuccess extends PurchaseResult {
  final String productId;
  final String tier;
  const PurchaseSuccess({required this.productId, required this.tier});
}

class PurchaseCancelled extends PurchaseResult {
  const PurchaseCancelled();
}

class PurchaseError extends PurchaseResult {
  final String message;
  final String? code;
  const PurchaseError({required this.message, this.code});
}

/// A product available for purchase
class SubscriptionProduct {
  final String productId;
  final String tier;
  final String title;
  final String description;
  final String price;
  final String period; // 'monthly' | 'annual'

  const SubscriptionProduct({
    required this.productId,
    required this.tier,
    required this.title,
    required this.description,
    required this.price,
    required this.period,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Interface
// ─────────────────────────────────────────────────────────────────────────────

/// Contract for subscription/payment operations.
///
/// Implement this interface when a payment provider is selected:
/// - RevenueCat: Use `purchases_flutter` package
/// - Apple StoreKit 2: Use `in_app_purchase` package
/// - Stripe: Use `stripe_sdk` + backend checkout sessions
abstract class SubscriptionService {
  /// Check current subscription status from the backend
  Future<SubscriptionStatus> checkStatus({required String token});

  /// Get available products/plans for purchase
  Future<List<SubscriptionProduct>> getProducts();

  /// Start a purchase flow for the given product
  Future<PurchaseResult> startPurchase({
    required String productId,
    required String token,
  });

  /// Restore previous purchases (e.g. after reinstall)
  Future<PurchaseResult> restorePurchases({required String token});
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend-Only Implementation (reads status, no IAP flow)
// ─────────────────────────────────────────────────────────────────────────────

/// Minimal implementation that only reads subscription status from the backend.
/// Purchase operations throw UnimplementedError until an IAP provider is wired.
class BackendSubscriptionService implements SubscriptionService {
  final Dio _dio;

  BackendSubscriptionService({required Dio dio}) : _dio = dio;

  @override
  Future<SubscriptionStatus> checkStatus({required String token}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/subscription/status',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
    final data = response.data!;
    final wrapped = data['data'];
    return SubscriptionStatus.fromJson(
      wrapped is Map ? Map<String, dynamic>.from(wrapped) : data,
    );
  }

  @override
  Future<List<SubscriptionProduct>> getProducts() async {
    // Payment provider not yet wired — return empty list so UI can show
    // a graceful "not available" state instead of crashing.
    return const [];
  }

  @override
  Future<PurchaseResult> startPurchase({
    required String productId,
    required String token,
  }) async {
    // Payment provider not yet wired — surface a user-friendly error.
    return const PurchaseError(
      message: 'In-app purchases are not available yet.',
      code: 'PROVIDER_NOT_CONFIGURED',
    );
  }

  @override
  Future<PurchaseResult> restorePurchases({required String token}) async {
    // Payment provider not yet wired — surface a user-friendly error.
    return const PurchaseError(
      message: 'Purchase restoration is not available yet.',
      code: 'PROVIDER_NOT_CONFIGURED',
    );
  }
}

int _asInt(Object? value, {int fallback = 0}) {
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

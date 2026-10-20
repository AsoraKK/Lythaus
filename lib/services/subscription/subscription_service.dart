// ignore_for_file: public_member_api_docs

/// LYTHAUS MEMBERSHIP ACCESS SERVICE
///
/// Reads the current server-issued tier and feed entitlements. The server does
/// not report payment-provider lifecycle state or payment confirmation.
library;

import 'package:dio/dio.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────────────────────────────────────

/// Current access tier and feed entitlements returned by the backend.
class SubscriptionStatus {
  final String tier;
  final SubscriptionEntitlements entitlements;

  const SubscriptionStatus({
    required this.tier,
    required this.entitlements,
  });

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) {
    final rawEntitlements = json['entitlements'];
    final tier = json['tier'];
    if (tier is! String || !{'free', 'premium', 'black'}.contains(tier)) {
      throw const FormatException(
        'The server returned an unsupported membership access tier.',
      );
    }
    if (rawEntitlements is! Map) {
      throw const FormatException(
        'The server response is missing membership entitlements.',
      );
    }

    return SubscriptionStatus(
      tier: tier,
      entitlements: SubscriptionEntitlements.fromJson(
        Map<String, dynamic>.from(rawEntitlements),
      ),
    );
  }
}

/// Feed entitlements returned for the current server-issued tier.
class SubscriptionEntitlements {
  final int maxCustomFeeds;
  final String newsBoardAccess;

  const SubscriptionEntitlements({
    required this.maxCustomFeeds,
    required this.newsBoardAccess,
  });

  factory SubscriptionEntitlements.fromJson(Map<String, dynamic> json) {
    final maxCustomFeeds = json['maxCustomFeeds'];
    final newsBoardAccess = json['newsBoardAccess'];
    if (maxCustomFeeds is! int || maxCustomFeeds < 1 || maxCustomFeeds > 3) {
      throw const FormatException(
        'The server returned an invalid custom-feed entitlement.',
      );
    }
    if (newsBoardAccess != 'none' && newsBoardAccess != 'full') {
      throw const FormatException(
        'The server returned an invalid News Board entitlement.',
      );
    }
    return SubscriptionEntitlements(
      maxCustomFeeds: maxCustomFeeds,
      newsBoardAccess: newsBoardAccess,
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

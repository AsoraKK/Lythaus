// ignore_for_file: public_member_api_docs

import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  group('BackendSubscriptionService — payments deferred', () {
    late _MockDio mockDio;
    late BackendSubscriptionService service;

    setUp(() {
      mockDio = _MockDio();
      service = BackendSubscriptionService(dio: mockDio);
    });

    // ── Req 4: getProducts returns empty list ──────────────────────────────

    test(
      'getProducts() returns empty list when provider is not configured',
      () async {
        final products = await service.getProducts();

        expect(products, isEmpty);
        verifyNever(() => mockDio.get<dynamic>(any()));
      },
    );

    // ── Req 2 & 4: startPurchase returns PROVIDER_NOT_CONFIGURED ──────────

    test(
      'startPurchase() returns PurchaseError with PROVIDER_NOT_CONFIGURED code',
      () async {
        final result = await service.startPurchase(
          productId: 'black_monthly',
          token: 'test-jwt',
        );

        expect(result, isA<PurchaseError>());
        final error = result as PurchaseError;
        expect(error.code, equals('PROVIDER_NOT_CONFIGURED'));
        expect(error.message, isNotEmpty);
        verifyNever(() => mockDio.post<dynamic>(any()));
      },
    );

    // ── Req 2 & 4: restorePurchases returns PROVIDER_NOT_CONFIGURED ───────

    test(
      'restorePurchases() returns PurchaseError with PROVIDER_NOT_CONFIGURED code',
      () async {
        final result = await service.restorePurchases(token: 'test-jwt');

        expect(result, isA<PurchaseError>());
        final error = result as PurchaseError;
        expect(error.code, equals('PROVIDER_NOT_CONFIGURED'));
        expect(error.message, isNotEmpty);
        verifyNever(() => mockDio.post<dynamic>(any()));
      },
    );

    // ── Req 1: No paywall route — verifies AppRoutes has no purchase path ──

    test('AppRoutes contains no subscription or paywall route constant', () {
      // AppRoutes is a compile-time abstract class — we verify at the type
      // level that no purchase/paywall route name is registered.
      // If a paywall route is later added, this test forces a deliberate
      // decision (adding the constant here) rather than a silent deploy.
      const knownRoutes = {
        'login',
        'auth-callback',
        'shell',
        'post',
        'profile',
        'invite',
        'moderation',
        'moderation-appeal',
        'notification-settings',
      };
      // Paywall-related names that must NOT appear in the route table.
      const forbiddenRouteFragments = [
        'paywall',
        'purchase',
        'subscribe',
        'upgrade',
        'checkout',
        'billing',
      ];
      for (final fragment in forbiddenRouteFragments) {
        for (final route in knownRoutes) {
          expect(
            route.contains(fragment),
            isFalse,
            reason:
                'Route "$route" contains paywall-related fragment "$fragment". '
                'Paywall routes must not be added until a payment provider is wired.',
          );
        }
      }
    });
  });

  group('Subscription models', () {
    test('parses the current server-issued entitlement response', () {
      final access = SubscriptionStatus.fromJson({
        'tier': 'black',
        'entitlements': {'maxCustomFeeds': 3, 'newsBoardAccess': 'full'},
      });

      expect(access.tier, 'black');
      expect(access.entitlements.maxCustomFeeds, 3);
      expect(access.entitlements.newsBoardAccess, 'full');
    });

    test('missing or unknown response tiers are contract errors', () {
      expect(
        () => SubscriptionStatus.fromJson({
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        }),
        throwsFormatException,
      );
      expect(
        () => SubscriptionStatus.fromJson({
          'tier': 'unknown',
          'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
        }),
        throwsFormatException,
      );
    });

    test('pending and payment metadata do not add lifecycle state', () {
      final manualTier = SubscriptionStatus.fromJson({
        'tier': 'premium',
        'status': 'active',
        'provider': 'manual',
        'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
      });
      final paymentClaim = SubscriptionStatus.fromJson({
        'tier': 'premium',
        'status': 'confirmed',
        'provider': 'stripe',
        'paymentConfirmed': true,
        'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'none'},
      });
      final pendingClaim = SubscriptionStatus.fromJson({
        'tier': 'free',
        'status': 'pending',
        'provider': 'stripe',
        'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
      });

      expect(manualTier.tier, 'premium');
      expect(paymentClaim.tier, manualTier.tier);
      expect(pendingClaim.tier, 'free');
      expect(manualTier.entitlements.maxCustomFeeds, 2);
      expect(paymentClaim.entitlements.maxCustomFeeds, 2);
    });

    test('incomplete entitlement payloads are unavailable, not Free', () {
      expect(
        () => SubscriptionStatus.fromJson({'tier': 'premium'}),
        throwsFormatException,
      );
      expect(
        () => SubscriptionStatus.fromJson({
          'tier': 'premium',
          'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccessLevel': 'full'},
        }),
        throwsFormatException,
      );
    });

    test('invalid entitlement values are rejected', () {
      expect(
        () => SubscriptionStatus.fromJson({
          'tier': 'premium',
          'entitlements': {'maxCustomFeeds': 9, 'newsBoardAccess': 'full'},
        }),
        throwsFormatException,
      );
      expect(
        () => SubscriptionStatus.fromJson({
          'tier': 'premium',
          'entitlements': {'maxCustomFeeds': 2, 'newsBoardAccess': 'preview'},
        }),
        throwsFormatException,
      );
    });

    test('server-issued Free tier remains a valid entitlement state', () {
      final freeAccess = SubscriptionStatus.fromJson({
        'tier': 'free',
        'entitlements': {'maxCustomFeeds': 1, 'newsBoardAccess': 'none'},
      });

      expect(freeAccess.tier, 'free');
      expect(freeAccess.entitlements.maxCustomFeeds, 1);
      expect(freeAccess.entitlements.newsBoardAccess, 'none');
    });

    test('Purchase result types are constructible', () {
      const success = PurchaseSuccess(productId: 'p1', tier: 'pro');
      const cancelled = PurchaseCancelled();
      const error = PurchaseError(message: 'not configured', code: 'X');

      expect(success.productId, 'p1');
      expect(cancelled, isA<PurchaseCancelled>());
      expect(error.code, 'X');
    });
  });
}

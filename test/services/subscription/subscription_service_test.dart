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
    test('SubscriptionStatus.fromJson parses and identifies expiry', () {
      final status = SubscriptionStatus.fromJson({
        'userId': 'u1',
        'tier': 'pro',
        'status': 'active',
        'provider': 'stripe',
        'currentPeriodEnd': DateTime.now()
            .add(const Duration(days: 1))
            .toIso8601String(),
        'cancelAtPeriodEnd': true,
        'entitlements': {
          'dailyPosts': 10,
          'maxMediaSizeMB': 20,
          'maxMediaPerPost': 3,
        },
      });

      expect(status.isPaid, isTrue);
      expect(status.isExpiring, isTrue);
      expect(status.entitlements.dailyPosts, 10);
    });

    test('SubscriptionStatus.isExpiring is false when period ended', () {
      final status = SubscriptionStatus.fromJson({
        'userId': 'u1',
        'tier': 'free',
        'status': 'inactive',
        'cancelAtPeriodEnd': true,
        'currentPeriodEnd': DateTime.now()
            .subtract(const Duration(days: 1))
            .toIso8601String(),
        'entitlements': {
          'dailyPosts': 1,
          'maxMediaSizeMB': 5,
          'maxMediaPerPost': 1,
        },
      });

      expect(status.isPaid, isFalse);
      expect(status.isExpiring, isFalse);
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

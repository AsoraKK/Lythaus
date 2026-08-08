// ignore: unused_import
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/subscription_tier.dart';
import 'package:lythaus/features/auth/domain/user.dart';

void main() {
  group('SubscriptionTier', () {
    test('fromString maps known values', () {
      expect(SubscriptionTier.fromString('free'), SubscriptionTier.free);
      expect(SubscriptionTier.fromString('premium'), SubscriptionTier.premium);
      expect(SubscriptionTier.fromString('black'), SubscriptionTier.black);
      expect(SubscriptionTier.fromString('guest'), SubscriptionTier.guest);
    });

    test('fromString is case-insensitive', () {
      expect(SubscriptionTier.fromString('FREE'), SubscriptionTier.free);
      expect(SubscriptionTier.fromString('Premium'), SubscriptionTier.premium);
      expect(SubscriptionTier.fromString('BLACK'), SubscriptionTier.black);
    });

    test('fromString defaults to free for unknown values', () {
      expect(SubscriptionTier.fromString('unknown'), SubscriptionTier.free);
      expect(SubscriptionTier.fromString('silver'), SubscriptionTier.free);
    });

    test('fromString defaults to free for null', () {
      expect(SubscriptionTier.fromString(null), SubscriptionTier.free);
    });

    test('has correct value strings', () {
      expect(SubscriptionTier.guest.value, 'guest');
      expect(SubscriptionTier.free.value, 'free');
      expect(SubscriptionTier.premium.value, 'premium');
      expect(SubscriptionTier.black.value, 'black');
    });
  });

  group('User.subscriptionTier', () {
    test('fromJson reads subscriptionTier field', () {
      final json = {
        'id': 'u1',
        'email': 'u1@example.com',
        'role': 'user',
        'tier': 'bronze',
        'subscriptionTier': 'premium',
        'createdAt': '2024-01-01T00:00:00.000Z',
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
      };
      final user = User.fromJson(json);
      expect(user.subscriptionTier, SubscriptionTier.premium);
    });

    test('fromJson reads subscription_tier (snake_case) field', () {
      final json = {
        'id': 'u1',
        'email': 'u1@example.com',
        'role': 'user',
        'tier': 'silver',
        'subscription_tier': 'black',
        'createdAt': '2024-01-01T00:00:00.000Z',
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
      };
      final user = User.fromJson(json);
      expect(user.subscriptionTier, SubscriptionTier.black);
    });

    test('fromJson defaults subscriptionTier to free when missing', () {
      final json = {
        'id': 'u1',
        'email': 'u1@example.com',
        'role': 'user',
        'tier': 'bronze',
        'createdAt': '2024-01-01T00:00:00.000Z',
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
      };
      final user = User.fromJson(json);
      expect(user.subscriptionTier, SubscriptionTier.free);
    });

    test('toJson includes subscriptionTier', () {
      final user = User(
        id: 'u1',
        email: 'u1@example.com',
        role: UserRole.user,
        // ignore: deprecated_member_use
        tier: UserTier.bronze,
        subscriptionTier: SubscriptionTier.premium,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
      );
      final json = user.toJson();
      expect(json['subscriptionTier'], 'premium');
    });

    test('copyWith updates subscriptionTier', () {
      final base = User(
        id: 'u1',
        email: 'u1@example.com',
        role: UserRole.user,
        // ignore: deprecated_member_use
        tier: UserTier.bronze,
        subscriptionTier: SubscriptionTier.free,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
      );
      final upgraded = base.copyWith(subscriptionTier: SubscriptionTier.black);
      expect(upgraded.subscriptionTier, SubscriptionTier.black);
      expect(upgraded.id, base.id); // unchanged
    });

    test('equality includes subscriptionTier', () {
      final a = User(
        id: 'u1',
        email: 'u1@example.com',
        role: UserRole.user,
        // ignore: deprecated_member_use
        tier: UserTier.bronze,
        subscriptionTier: SubscriptionTier.free,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
      );
      final b = a.copyWith(subscriptionTier: SubscriptionTier.premium);
      expect(a == b, false);
      expect(a == a.copyWith(), true);
    });
  });
}

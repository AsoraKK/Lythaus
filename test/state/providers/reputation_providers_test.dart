import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';

void main() {
  group('reputationTiersProvider', () {
    test('provides three tiers', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);

      expect(tiers, hasLength(3));
    });

    test('tiers are ordered by minXP', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);

      expect(tiers[0].id, 'free');
      expect(tiers[0].minXP, 0);
      expect(tiers[1].id, 'premium');
      expect(tiers[1].minXP, 1200);
      expect(tiers[2].id, 'black');
      expect(tiers[2].minXP, 3200);
    });

    test('free tier has expected privileges', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);
      final free = tiers.firstWhere((t) => t.id == 'free');

      expect(free.privileges, isNotEmpty);
      expect(free.privileges, contains('Limited daily posting'));
      expect(
        free.privileges,
        contains('Rewards capped through reputation level 3'),
      );
    });

    test('premium tier has expected privileges', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);
      final premium = tiers.firstWhere((t) => t.id == 'premium');

      expect(premium.name, 'Premium');
      expect(premium.privileges, isNotEmpty);
    });

    test('black tier has expected privileges', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);
      final black = tiers.firstWhere((t) => t.id == 'black');

      expect(black.name, 'Black');
      expect(black.minXP, 3200);
      expect(black.privileges, isNotEmpty);
    });

    test('each tier has a unique id', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tiers = container.read(reputationTiersProvider);
      final ids = tiers.map((t) => t.id).toSet();

      expect(ids.length, tiers.length);
    });
  });

  group('reputationProvider', () {
    User userWithTier(UserTier tier) {
      return User(
        id: 'u1',
        email: 'user@example.com',
        role: UserRole.user,
        tier: tier,
        reputationScore: 42,
        createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
        lastLoginAt: DateTime.parse('2026-01-01T00:00:00Z'),
      );
    }

    test(
      'uses subscription tier and paid achievement when token exists',
      () async {
        final status = SubscriptionStatus(
          userId: 'u1',
          tier: 'premium',
          status: 'active',
          provider: 'test',
          currentPeriodEnd: DateTime.now().add(const Duration(days: 14)),
          cancelAtPeriodEnd: true,
          entitlements: const SubscriptionEntitlements(
            dailyPosts: 20,
            dailyComments: 100,
            dailyReactions: 300,
            dailyAppeals: 6,
            exportCooldownDays: 14,
            maxMediaSizeMB: 30,
            maxMediaPerPost: 4,
            maxCustomFeeds: 2,
            newsBoardAccessLevel: 'full',
            newsBoardPreview: true,
            postingRestricted: false,
            rewardLevelCap: 5,
            rewardOptionsPerLevel: 1,
            rewardChoiceBreadth: 'increased',
          ),
        );

        final container = ProviderContainer(
          overrides: [
            currentUserProvider.overrideWithValue(
              userWithTier(UserTier.bronze),
            ),
            jwtProvider.overrideWith((_) async => 'token'),
            subscriptionServiceProvider.overrideWithValue(
              _FakeSubscriptionService(status),
            ),
          ],
        );
        addTearDown(container.dispose);

        final reputation = await container.read(reputationProvider.future);

        expect(reputation.tier.id, 'premium');
        expect(reputation.missions, hasLength(3));
        expect(
          reputation.recentAchievements,
          contains('Subscription entitlement active: Premium'),
        );
        expect(
          reputation.recentAchievements,
          contains('Paid tier entitlements active'),
        );
        expect(
          reputation.recentAchievements.any(
            (item) => item.startsWith('Renews through '),
          ),
          isTrue,
        );
      },
    );

    test('falls back to user tier mapping when token is missing', () async {
      final container = ProviderContainer(
        overrides: [
          currentUserProvider.overrideWithValue(
            userWithTier(UserTier.platinum),
          ),
          jwtProvider.overrideWith((_) async => null),
        ],
      );
      addTearDown(container.dispose);

      final reputation = await container.read(reputationProvider.future);
      expect(reputation.tier.id, 'black');
      expect(reputation.missions, isEmpty);
      expect(
        reputation.recentAchievements,
        contains('Subscription entitlement active: Black'),
      );
    });

    test(
      'falls back to user tier mapping when subscription check fails',
      () async {
        final container = ProviderContainer(
          overrides: [
            currentUserProvider.overrideWithValue(userWithTier(UserTier.gold)),
            jwtProvider.overrideWith((_) async => 'token'),
            subscriptionServiceProvider.overrideWithValue(
              _ThrowingSubscriptionService(),
            ),
          ],
        );
        addTearDown(container.dispose);

        final reputation = await container.read(reputationProvider.future);
        expect(reputation.tier.id, 'premium');
        expect(reputation.missions, isEmpty);
        expect(
          reputation.recentAchievements,
          contains('Subscription entitlement active: Premium'),
        );
      },
    );
  });
}

class _FakeSubscriptionService extends BackendSubscriptionService {
  _FakeSubscriptionService(this._status) : super(dio: Dio());

  final SubscriptionStatus _status;

  @override
  Future<SubscriptionStatus> checkStatus({required String token}) async {
    return _status;
  }
}

class _ThrowingSubscriptionService extends BackendSubscriptionService {
  _ThrowingSubscriptionService() : super(dio: Dio());

  @override
  Future<SubscriptionStatus> checkStatus({required String token}) {
    throw Exception('subscription unavailable');
  }
}

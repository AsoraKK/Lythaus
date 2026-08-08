import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  group('ReputationTier', () {
    test('constructs with required fields', () {
      const tier = ReputationTier(
        id: 'premium',
        name: 'Premium',
        minXP: 1200,
        privileges: ['custom feeds', 'rewards'],
      );

      expect(tier.id, 'premium');
      expect(tier.name, 'Premium');
      expect(tier.minXP, 1200);
      expect(tier.privileges, hasLength(2));
    });

    test('supports const construction', () {
      const tier1 = ReputationTier(
        id: 'free',
        name: 'Free',
        minXP: 0,
        privileges: [],
      );
      const tier2 = ReputationTier(
        id: 'free',
        name: 'Free',
        minXP: 0,
        privileges: [],
      );

      expect(tier1.id, tier2.id);
      expect(tier1.minXP, tier2.minXP);
    });
  });

  group('Mission', () {
    test('constructs with required fields and defaults', () {
      const mission = Mission(
        id: 'daily_post',
        title: 'Post daily',
        xpReward: 50,
      );

      expect(mission.id, 'daily_post');
      expect(mission.title, 'Post daily');
      expect(mission.xpReward, 50);
      expect(mission.completed, false);
    });

    test('constructs with completed flag', () {
      const mission = Mission(
        id: 'daily_login',
        title: 'Log in daily',
        xpReward: 10,
        completed: true,
      );

      expect(mission.completed, true);
    });
  });

  group('UserReputation', () {
    const baseTier = ReputationTier(
      id: 'free',
      name: 'Free',
      minXP: 0,
      privileges: ['basic feed'],
    );

    test('constructs with required fields and defaults', () {
      const rep = UserReputation(xp: 100, tier: baseTier);

      expect(rep.xp, 100);
      expect(rep.tier.id, 'free');
      expect(rep.missions, isEmpty);
      expect(rep.recentAchievements, isEmpty);
    });

    test('constructs with missions and achievements', () {
      const mission = Mission(
        id: 'm1',
        title: 'Test',
        xpReward: 10,
        completed: true,
      );

      const rep = UserReputation(
        xp: 500,
        tier: baseTier,
        missions: [mission],
        recentAchievements: ['First post'],
      );

      expect(rep.missions, hasLength(1));
      expect(rep.recentAchievements, contains('First post'));
    });

    test('copyWith replaces xp', () {
      const original = UserReputation(xp: 100, tier: baseTier);
      final updated = original.copyWith(xp: 200);

      expect(updated.xp, 200);
      expect(updated.tier.id, 'free');
    });

    test('copyWith replaces tier', () {
      const premiumTier = ReputationTier(
        id: 'premium',
        name: 'Premium',
        minXP: 1200,
        privileges: ['extra feeds'],
      );

      const original = UserReputation(xp: 100, tier: baseTier);
      final updated = original.copyWith(tier: premiumTier);

      expect(updated.tier.id, 'premium');
      expect(updated.xp, 100);
    });

    test('copyWith replaces missions', () {
      const mission = Mission(id: 'm1', title: 'New', xpReward: 25);

      const original = UserReputation(xp: 100, tier: baseTier);
      final updated = original.copyWith(missions: const [mission]);

      expect(updated.missions, hasLength(1));
      expect(updated.missions.first.title, 'New');
    });

    test('copyWith replaces recentAchievements', () {
      const original = UserReputation(xp: 100, tier: baseTier);
      final updated = original.copyWith(
        recentAchievements: const ['Achievement 1', 'Achievement 2'],
      );

      expect(updated.recentAchievements, hasLength(2));
    });

    test('copyWith with no arguments returns equivalent object', () {
      const mission = Mission(id: 'm1', title: 'Test', xpReward: 5);
      const original = UserReputation(
        xp: 300,
        tier: baseTier,
        missions: [mission],
        recentAchievements: ['Ach1'],
      );
      final copy = original.copyWith();

      expect(copy.xp, original.xp);
      expect(copy.tier.id, original.tier.id);
      expect(copy.missions.length, original.missions.length);
      expect(
        copy.recentAchievements.length,
        original.recentAchievements.length,
      );
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/state/models/reputation.dart';

void main() {
  group('ReputationLevel', () {
    test('has 6 values (0–5)', () {
      expect(ReputationLevel.values.length, 6);
    });

    test('values have expected numeric levels', () {
      expect(ReputationLevel.newUser.value, 0);
      expect(ReputationLevel.verified.value, 1);
      expect(ReputationLevel.trusted.value, 2);
      expect(ReputationLevel.established.value, 3);
      expect(ReputationLevel.credible.value, 4);
      expect(ReputationLevel.highlyCredible.value, 5);
    });

    test('display names are correct', () {
      expect(ReputationLevel.newUser.displayName, 'New');
      expect(ReputationLevel.verified.displayName, 'Verified');
      expect(ReputationLevel.trusted.displayName, 'Trusted');
      expect(ReputationLevel.established.displayName, 'Established');
      expect(ReputationLevel.credible.displayName, 'Credible');
      expect(ReputationLevel.highlyCredible.displayName, 'Highly Credible');
    });
  });

  group('computeLevelFromScore', () {
    test('score 0 → New', () {
      expect(computeLevelFromScore(0), ReputationLevel.newUser);
    });

    test('score 9 → New', () {
      expect(computeLevelFromScore(9), ReputationLevel.newUser);
    });

    test('score 10 → Verified', () {
      expect(computeLevelFromScore(10), ReputationLevel.verified);
    });

    test('score 49 → Verified', () {
      expect(computeLevelFromScore(49), ReputationLevel.verified);
    });

    test('score 50 → Trusted', () {
      expect(computeLevelFromScore(50), ReputationLevel.trusted);
    });

    test('score 199 → Trusted', () {
      expect(computeLevelFromScore(199), ReputationLevel.trusted);
    });

    test('score 200 → Established', () {
      expect(computeLevelFromScore(200), ReputationLevel.established);
    });

    test('score 499 → Established', () {
      expect(computeLevelFromScore(499), ReputationLevel.established);
    });

    test('score 500 → Credible', () {
      expect(computeLevelFromScore(500), ReputationLevel.credible);
    });

    test('score 999 → Credible', () {
      expect(computeLevelFromScore(999), ReputationLevel.credible);
    });

    test('score 1000 → Highly Credible', () {
      expect(computeLevelFromScore(1000), ReputationLevel.highlyCredible);
    });

    test('score 9999 → Highly Credible', () {
      expect(computeLevelFromScore(9999), ReputationLevel.highlyCredible);
    });

    test('negative score → New', () {
      expect(computeLevelFromScore(-100), ReputationLevel.newUser);
    });
  });

  group('levelDisplayName', () {
    test('returns the level display name', () {
      expect(levelDisplayName(ReputationLevel.trusted), 'Trusted');
      expect(
        levelDisplayName(ReputationLevel.highlyCredible),
        'Highly Credible',
      );
    });
  });

  group('LedgerEntry.fromJson', () {
    test('deserializes a full entry', () {
      final json = {
        'id': 'entry-1',
        'userId': 'user-1',
        'eventType': 'HUMAN_TEXT_250_PLUS',
        'eventCategory': 'positive',
        'pillar': 'human_contribution',
        'publicLabel': 'Wrote a long post',
        'impactBand': 'small_positive',
        'visibility': 'public',
        'appealable': false,
        'status': 'active',
        'createdAt': '2024-06-01T10:00:00.000Z',
      };

      final entry = LedgerEntry.fromJson(json);
      expect(entry.id, 'entry-1');
      expect(entry.userId, 'user-1');
      expect(entry.eventType, 'HUMAN_TEXT_250_PLUS');
      expect(entry.eventCategory, 'positive');
      expect(entry.pillar, 'human_contribution');
      expect(entry.publicLabel, 'Wrote a long post');
      expect(entry.impactBand, 'small_positive');
      expect(entry.visibility, 'public');
      expect(entry.appealable, false);
      expect(entry.status, 'active');
      expect(entry.createdAt, DateTime.parse('2024-06-01T10:00:00.000Z'));
      expect(entry.relatedContentId, isNull);
      expect(entry.appealStatus, isNull);
      expect(entry.decaysAt, isNull);
    });

    test('deserializes optional fields when present', () {
      final json = {
        'id': 'entry-2',
        'userId': 'user-1',
        'eventType': 'MODERATION_VIOLATION',
        'eventCategory': 'negative',
        'pillar': 'behaviour_trust',
        'publicLabel': 'Content removed',
        'impactBand': 'large_negative',
        'visibility': 'public',
        'appealable': true,
        'status': 'active',
        'createdAt': '2024-06-01T10:00:00.000Z',
        'relatedContentId': 'post-abc',
        'relatedModerationDecisionId': 'decision-xyz',
        'appealStatus': 'pending',
        'decaysAt': '2024-09-01T10:00:00.000Z',
      };

      final entry = LedgerEntry.fromJson(json);
      expect(entry.relatedContentId, 'post-abc');
      expect(entry.relatedModerationDecisionId, 'decision-xyz');
      expect(entry.appealStatus, 'pending');
      expect(entry.decaysAt, DateTime.parse('2024-09-01T10:00:00.000Z'));
      expect(entry.appealable, true);
    });

    test('defaults appealable to false when missing', () {
      final json = {
        'id': 'e3',
        'userId': 'u1',
        'eventType': 'DECAY_EXPIRED',
        'eventCategory': 'neutral',
        'pillar': 'human_contribution',
        'publicLabel': 'Score decayed',
        'impactBand': 'neutral',
        'visibility': 'internal',
        'status': 'expired',
        'createdAt': '2024-01-01T00:00:00.000Z',
      };

      final entry = LedgerEntry.fromJson(json);
      expect(entry.appealable, false);
    });
  });

  group('UserReputation', () {
    test('defaults reputationLevel to newUser', () {
      const rep = UserReputation(
        xp: 0,
        tier: ReputationTier(
          id: 'free',
          name: 'Free',
          minXP: 0,
          privileges: [],
        ),
      );
      expect(rep.reputationLevel, ReputationLevel.newUser);
      expect(rep.reputationBand, 'New');
    });

    test('copyWith updates reputationLevel', () {
      const rep = UserReputation(
        xp: 100,
        tier: ReputationTier(
          id: 'free',
          name: 'Free',
          minXP: 0,
          privileges: [],
        ),
      );
      final updated = rep.copyWith(
        reputationLevel: ReputationLevel.established,
        reputationBand: 'Established',
      );
      expect(updated.reputationLevel, ReputationLevel.established);
      expect(updated.reputationBand, 'Established');
    });
  });
}

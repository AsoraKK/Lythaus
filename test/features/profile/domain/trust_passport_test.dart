import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/profile/domain/trust_passport.dart';

void main() {
  group('TrustPassport', () {
    test('can be constructed with required fields', () {
      const passport = TrustPassport(
        userId: 'u1',
        visibility: 'public_expanded',
        transparencyStreakCategory: 'Gold',
        appealsResolvedFairlyLabel: 'Most resolved',
        jurorReliabilityTier: 'Silver',
        counts: TrustPassportCounts(),
      );
      expect(passport.userId, 'u1');
      expect(passport.visibility, 'public_expanded');
      expect(passport.transparencyStreakCategory, 'Gold');
      expect(passport.appealsResolvedFairlyLabel, 'Most resolved');
      expect(passport.jurorReliabilityTier, 'Silver');
    });

    test('fromJson parses full payload', () {
      final json = {
        'userId': 'user-123',
        'visibility': 'private',
        'transparencyStreakCategory': 'Legendary',
        'appealsResolvedFairlyLabel': 'Top resolver',
        'jurorReliabilityTier': 'Diamond',
        'counts': {
          'transparency': {'totalPosts': 42, 'postsWithSignals': 10},
          'appeals': {'resolved': 5, 'approved': 3, 'rejected': 2},
          'juror': {'votesCast': 20, 'alignedVotes': 18},
        },
      };
      final passport = TrustPassport.fromJson(json);
      expect(passport.userId, 'user-123');
      expect(passport.visibility, 'private');
      expect(passport.transparencyStreakCategory, 'Legendary');
      expect(passport.appealsResolvedFairlyLabel, 'Top resolver');
      expect(passport.jurorReliabilityTier, 'Diamond');
      expect(passport.counts.totalPosts, 42);
      expect(passport.counts.postsWithSignals, 10);
      expect(passport.counts.appealsResolved, 5);
      expect(passport.counts.appealsApproved, 3);
      expect(passport.counts.appealsRejected, 2);
      expect(passport.counts.votesCast, 20);
      expect(passport.counts.alignedVotes, 18);
    });

    test('fromJson uses defaults for missing optional fields', () {
      final json = {'userId': 'u2', 'counts': <String, dynamic>{}};
      final passport = TrustPassport.fromJson(json);
      expect(passport.visibility, 'public_minimal');
      expect(passport.transparencyStreakCategory, 'Rare');
      expect(passport.appealsResolvedFairlyLabel, 'Appeals resolved fairly');
      expect(passport.jurorReliabilityTier, 'Bronze');
    });

    test('fromJson falls back to public_minimal for unknown visibility', () {
      final passport = TrustPassport.fromJson(const {
        'userId': 'u5',
        'visibility': 'friends_only',
        'counts': <String, dynamic>{},
      });

      expect(passport.visibility, 'public_minimal');
    });

    test('fromJson handles counts not being a Map<String, dynamic>', () {
      final json = {
        'userId': 'u3',
        'counts': <dynamic, dynamic>{'transparency': null},
      };
      final passport = TrustPassport.fromJson(json);
      expect(passport.counts.totalPosts, 0);
    });

    test('fromJson handles counts being non-map', () {
      final json = {'userId': 'u4', 'counts': 'invalid'};
      final passport = TrustPassport.fromJson(json);
      expect(passport.counts.totalPosts, 0);
    });
  });

  group('TrustPassportCounts', () {
    test('defaults to zero for all fields', () {
      const counts = TrustPassportCounts();
      expect(counts.totalPosts, 0);
      expect(counts.postsWithSignals, 0);
      expect(counts.appealsResolved, 0);
      expect(counts.appealsApproved, 0);
      expect(counts.appealsRejected, 0);
      expect(counts.votesCast, 0);
      expect(counts.alignedVotes, 0);
    });

    test('fromJson with null sub-maps defaults to zero', () {
      final counts = TrustPassportCounts.fromJson(const {});
      expect(counts.totalPosts, 0);
      expect(counts.votesCast, 0);
      expect(counts.appealsResolved, 0);
    });

    test('fromJson parses nested maps', () {
      final counts = TrustPassportCounts.fromJson(const {
        'transparency': {'totalPosts': 100, 'postsWithSignals': 50},
        'appeals': {'resolved': 10, 'approved': 7, 'rejected': 3},
        'juror': {'votesCast': 30, 'alignedVotes': 25},
      });
      expect(counts.totalPosts, 100);
      expect(counts.postsWithSignals, 50);
      expect(counts.appealsResolved, 10);
      expect(counts.appealsApproved, 7);
      expect(counts.appealsRejected, 3);
      expect(counts.votesCast, 30);
      expect(counts.alignedVotes, 25);
    });

    test('fromJson handles numeric doubles via num.toInt()', () {
      final counts = TrustPassportCounts.fromJson(const {
        'transparency': {'totalPosts': 5.0, 'postsWithSignals': 2.5},
        'appeals': null,
        'juror': null,
      });
      expect(counts.totalPosts, 5);
      expect(counts.postsWithSignals, 2);
    });
  });
}

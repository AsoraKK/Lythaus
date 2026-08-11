import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/reactions/domain/reaction.dart';

void main() {
  // ─────────────────────────────────────────────────────────────────────────
  // ReactionType enum
  // ─────────────────────────────────────────────────────────────────────────
  group('ReactionType', () {
    test('apiValue mirrors canonical wire values', () {
      expect(ReactionType.like.apiValue, 'like');
      expect(ReactionType.insightful.apiValue, 'insightful');
      expect(ReactionType.support.apiValue, 'support');
    });

    test('fromApi resolves all types', () {
      for (final type in ReactionType.values) {
        expect(ReactionType.fromApi(type.apiValue), type);
      }
    });

    test('fromApi returns null for unknown value', () {
      expect(ReactionType.fromApi('unknown_reaction'), isNull);
    });

    group('direction / isPositive / isNegative', () {
      test('positive reactions have direction=1 and isPositive=true', () {
        for (final type in [
          ReactionType.like,
          ReactionType.insightful,
          ReactionType.support,
        ]) {
          expect(type.direction, 1, reason: '${type.name} should be positive');
          expect(type.isPositive, isTrue);
          expect(type.isNegative, isFalse);
        }
      });
    });

    test('all types have non-empty labels', () {
      for (final type in ReactionType.values) {
        expect(type.label, isNotEmpty, reason: '${type.name} label is empty');
      }
    });

    test('enum covers all canonical reaction types', () {
      expect(ReactionType.values.length, 3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ReactionSummary
  // ─────────────────────────────────────────────────────────────────────────
  group('ReactionSummary', () {
    test('fromJson / toJson round-trip', () {
      const summary = ReactionSummary(
        counts: {'like': 3, 'insightful': 1},
        myReactionType: 'like',
      );
      final json = summary.toJson();
      final restored = ReactionSummary.fromJson(json);
      expect(restored.counts, {'like': 3, 'insightful': 1});
      expect(restored.myReactionType, 'like');
    });

    test('defaults to empty counts and null myReactionType', () {
      const s = ReactionSummary();
      expect(s.counts, isEmpty);
      expect(s.myReactionType, isNull);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SubmitReactionRequest
  // ─────────────────────────────────────────────────────────────────────────
  group('SubmitReactionRequest', () {
    test('serialises to expected JSON keys', () {
      const req = SubmitReactionRequest(postId: 'post-1', reactionType: 'like');
      final json = req.toJson();
      expect(json, {'reactionType': 'like'});
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SubmitReactionResponse
  // ─────────────────────────────────────────────────────────────────────────
  group('SubmitReactionResponse', () {
    test('deserialises all fields', () {
      final response = SubmitReactionResponse.fromJson({
        'postId': 'post-1',
        'reactionType': 'like',
        'changed': true,
      });
      expect(response.postId, 'post-1');
      expect(response.reactionType, 'like');
      expect(response.changed, isTrue);
    });
  });
}

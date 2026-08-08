import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/reactions/domain/reaction.dart';

void main() {
  // ─────────────────────────────────────────────────────────────────────────
  // ReactionType enum
  // ─────────────────────────────────────────────────────────────────────────
  group('ReactionType', () {
    test('apiValue uses underscores for multi-word types', () {
      expect(ReactionType.well_sourced.apiValue, 'well_sourced');
      expect(ReactionType.low_effort.apiValue, 'low_effort');
      expect(ReactionType.helpful.apiValue, 'helpful');
      expect(ReactionType.report.apiValue, 'report');
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
          ReactionType.helpful,
          ReactionType.well_sourced,
          ReactionType.thoughtful,
          ReactionType.agree,
        ]) {
          expect(type.direction, 1, reason: '${type.name} should be positive');
          expect(type.isPositive, isTrue);
          expect(type.isNegative, isFalse);
        }
      });

      test('negative reactions have direction=-1 and isNegative=true', () {
        for (final type in [
          ReactionType.misleading,
          ReactionType.low_effort,
          ReactionType.disagree,
        ]) {
          expect(type.direction, -1, reason: '${type.name} should be negative');
          expect(type.isNegative, isTrue);
          expect(type.isPositive, isFalse);
        }
      });

      test('report has direction=0 (neutral)', () {
        expect(ReactionType.report.direction, 0);
        expect(ReactionType.report.isPositive, isFalse);
        expect(ReactionType.report.isNegative, isFalse);
      });
    });

    test('all types have non-empty labels', () {
      for (final type in ReactionType.values) {
        expect(type.label, isNotEmpty, reason: '${type.name} label is empty');
      }
    });

    test('enum covers all 8 expected types', () {
      expect(ReactionType.values.length, 8);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ReactionSummary
  // ─────────────────────────────────────────────────────────────────────────
  group('ReactionSummary', () {
    test('fromJson / toJson round-trip', () {
      const summary = ReactionSummary(
        counts: {'helpful': 3, 'agree': 1},
        myReactionType: 'helpful',
      );
      final json = summary.toJson();
      final restored = ReactionSummary.fromJson(json);
      expect(restored.counts, {'helpful': 3, 'agree': 1});
      expect(restored.myReactionType, 'helpful');
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
      const req = SubmitReactionRequest(
        targetContentId: 'post-1',
        targetUserId: 'user-1',
        reactionType: 'helpful',
      );
      final json = req.toJson();
      expect(json['targetContentId'], 'post-1');
      expect(json['targetUserId'], 'user-1');
      expect(json['reactionType'], 'helpful');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SubmitReactionResponse
  // ─────────────────────────────────────────────────────────────────────────
  group('SubmitReactionResponse', () {
    test('deserialises all fields', () {
      final response = SubmitReactionResponse.fromJson({
        'reactionId': 'rxn-1',
        'reactionType': 'helpful',
        'includedInReputation': true,
        'antiGamingStatus': 'clear',
      });
      expect(response.reactionId, 'rxn-1');
      expect(response.reactionType, 'helpful');
      expect(response.includedInReputation, isTrue);
      expect(response.antiGamingStatus, 'clear');
    });
  });
}

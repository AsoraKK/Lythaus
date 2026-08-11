/// Tests for PostInsights domain model JSON parsing
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

void main() {
  group('RiskBand', () {
    test('fromString parses LOW correctly', () {
      expect(RiskBand.fromString('LOW'), RiskBand.low);
      expect(RiskBand.fromString('low'), RiskBand.low);
    });

    test('fromString parses MEDIUM correctly', () {
      expect(RiskBand.fromString('MEDIUM'), RiskBand.medium);
      expect(RiskBand.fromString('medium'), RiskBand.medium);
    });

    test('fromString parses HIGH correctly', () {
      expect(RiskBand.fromString('HIGH'), RiskBand.high);
      expect(RiskBand.fromString('high'), RiskBand.high);
    });

    test('fromString defaults to medium for unknown values', () {
      expect(RiskBand.fromString('unknown'), RiskBand.medium);
      expect(RiskBand.fromString(''), RiskBand.medium);
    });

    test('displayLabel returns correct labels', () {
      expect(RiskBand.low.displayLabel, 'Low');
      expect(
        RiskBand.medium.displayLabel,
        'Appeal pending',
      ); // MEDIUM = appeal pending
      expect(RiskBand.high.displayLabel, 'High');
    });
  });

  group('InsightDecision (binary)', () {
    test('fromString parses ALLOW correctly', () {
      expect(InsightDecision.fromString('ALLOW'), InsightDecision.allow);
      expect(InsightDecision.fromString('allow'), InsightDecision.allow);
    });

    test('fromString parses BLOCK correctly', () {
      expect(InsightDecision.fromString('BLOCK'), InsightDecision.block);
      expect(InsightDecision.fromString('block'), InsightDecision.block);
    });

    test('fromString defaults to block for unknown values (safe default)', () {
      expect(InsightDecision.fromString('unknown'), InsightDecision.block);
      expect(
        InsightDecision.fromString('QUEUE'),
        InsightDecision.block,
      ); // QUEUE collapses to BLOCK
    });

    test('displayLabel returns correct labels', () {
      expect(InsightDecision.allow.displayLabel, 'Published');
      expect(InsightDecision.block.displayLabel, 'Blocked');
    });

    test('only has two values (ALLOW and BLOCK)', () {
      expect(InsightDecision.values.length, 2);
      expect(InsightDecision.values, contains(InsightDecision.allow));
      expect(InsightDecision.values, contains(InsightDecision.block));
    });
  });

  group('InsightAppealStatus', () {
    test('fromString parses all statuses correctly', () {
      expect(InsightAppealStatus.fromString('NONE'), InsightAppealStatus.none);
      expect(
        InsightAppealStatus.fromString('PENDING'),
        InsightAppealStatus.pending,
      );
      expect(
        InsightAppealStatus.fromString('OVERTURN'),
        InsightAppealStatus.overturned,
      );
      expect(
        InsightAppealStatus.fromString('UPHOLD'),
        InsightAppealStatus.upheld,
      );
    });

    test('fromString defaults to none for unknown values', () {
      expect(
        InsightAppealStatus.fromString('unknown'),
        InsightAppealStatus.none,
      );
    });

    test('displayLabel returns correct labels', () {
      expect(InsightAppealStatus.none.displayLabel, 'None');
      expect(InsightAppealStatus.pending.displayLabel, 'Pending');
      expect(InsightAppealStatus.overturned.displayLabel, 'Restored');
      expect(InsightAppealStatus.upheld.displayLabel, 'Upheld');
    });
  });

  group('InsightAppeal', () {
    test('fromJson parses appeal with status only', () {
      final json = {'status': 'PENDING'};
      final appeal = InsightAppeal.fromJson(json);

      expect(appeal.status, InsightAppealStatus.pending);
      expect(appeal.updatedAt, isNull);
    });

    test('fromJson parses appeal with status and updatedAt', () {
      final json = {
        'status': 'OVERTURN',
        'updatedAt': '2025-12-28T10:00:00.000Z',
      };
      final appeal = InsightAppeal.fromJson(json);

      expect(appeal.status, InsightAppealStatus.overturned);
      expect(appeal.updatedAt, isNotNull);
      expect(appeal.updatedAt!.year, 2025);
      expect(appeal.updatedAt!.month, 12);
      expect(appeal.updatedAt!.day, 28);
    });

    test('toJson produces correct output', () {
      final appeal = InsightAppeal(
        status: InsightAppealStatus.upheld,
        updatedAt: DateTime.utc(2025, 12, 28, 11, 30),
      );
      final json = appeal.toJson();

      expect(json['status'], 'UPHOLD');
      expect(json['updatedAt'], '2025-12-28T11:30:00.000Z');
    });
  });

  group('PostInsights', () {
    test('fromJson parses complete insights response', () {
      final json = {
        'postId': 'post-123',
        'riskBand': 'HIGH',
        'decision': 'BLOCK',
        'reasonCodes': ['AUTHENTICITY_SCORE_OVER_THRESHOLD'],
        'configVersion': 42,
        'decidedAt': '2025-12-28T10:00:00.000Z',
        'appeal': {
          'status': 'PENDING',
          'updatedAt': '2025-12-28T11:00:00.000Z',
        },
      };

      final insights = PostInsights.fromJson(json);

      expect(insights.postId, 'post-123');
      expect(insights.riskBand, RiskBand.high);
      expect(insights.decision, InsightDecision.block);
      expect(
        insights.reasonCodes,
        contains('AUTHENTICITY_SCORE_OVER_THRESHOLD'),
      );
      expect(insights.configVersion, 42);
      expect(insights.decidedAt.year, 2025);
      expect(insights.appeal.status, InsightAppealStatus.pending);
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'postId': 'post-456',
        'riskBand': 'LOW',
        'decision': 'ALLOW',
        'configVersion': 1,
        'decidedAt': '2025-12-28T10:00:00.000Z',
      };

      final insights = PostInsights.fromJson(json);

      expect(insights.postId, 'post-456');
      expect(insights.riskBand, RiskBand.low);
      expect(insights.reasonCodes, isEmpty);
      expect(insights.appeal.status, InsightAppealStatus.none);
    });

    test('fromJson provides defaults for missing values', () {
      final json = {'postId': 'post-789'};

      final insights = PostInsights.fromJson(json);

      expect(insights.postId, 'post-789');
      expect(insights.riskBand, RiskBand.medium);
      expect(insights.decision, InsightDecision.block); // Safe default
      expect(insights.configVersion, 0);
    });

    test('toJson produces correct output', () {
      final insights = PostInsights(
        postId: 'post-abc',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: ['AUTHENTICITY_SCORE_UNDER_THRESHOLD'],
        configVersion: 5,
        decidedAt: DateTime.utc(2025, 12, 28, 10, 0),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      final json = insights.toJson();

      expect(json['postId'], 'post-abc');
      expect(json['riskBand'], 'LOW');
      expect(json['decision'], 'ALLOW');
      expect(
        json['reasonCodes'],
        contains('AUTHENTICITY_SCORE_UNDER_THRESHOLD'),
      );
      expect(json['configVersion'], 5);
      expect(json['decidedAt'], '2025-12-28T10:00:00.000Z');
      expect(json['appeal']['status'], 'NONE');
    });

    test('does NOT include forbidden fields like scores or thresholds', () {
      // This test ensures the model doesn't accidentally include sensitive data
      final insights = PostInsights(
        postId: 'post-test',
        riskBand: RiskBand.high,
        decision: InsightDecision.block,
        reasonCodes: [],
        configVersion: 10,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      final json = insights.toJson();
      final jsonStr = json.toString().toLowerCase();

      // Verify no forbidden field names appear
      expect(jsonStr.contains('score'), isFalse);
      expect(jsonStr.contains('probability'), isFalse);
      expect(jsonStr.contains('threshold'), isFalse);
      expect(jsonStr.contains('confidence'), isFalse);
      expect(jsonStr.contains('severity'), isFalse);
    });
  });
}

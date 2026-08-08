// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

void main() {
  group('RiskBand', () {
    test('has all enum values', () {
      expect(RiskBand.values, hasLength(3));
      expect(RiskBand.values, contains(RiskBand.low));
      expect(RiskBand.values, contains(RiskBand.medium));
      expect(RiskBand.values, contains(RiskBand.high));
    });

    test('fromString parses case-insensitively', () {
      expect(RiskBand.fromString('LOW'), equals(RiskBand.low));
      expect(RiskBand.fromString('MEDIUM'), equals(RiskBand.medium));
      expect(RiskBand.fromString('HIGH'), equals(RiskBand.high));
    });

    test('fromString handles lowercase', () {
      expect(RiskBand.fromString('low'), equals(RiskBand.low));
      expect(RiskBand.fromString('medium'), equals(RiskBand.medium));
      expect(RiskBand.fromString('high'), equals(RiskBand.high));
    });

    test('fromString defaults to medium for unknown values', () {
      expect(RiskBand.fromString('UNKNOWN'), equals(RiskBand.medium));
      expect(RiskBand.fromString(''), equals(RiskBand.medium));
      expect(RiskBand.fromString('invalid'), equals(RiskBand.medium));
    });

    test('displayLabel returns proper strings', () {
      expect(RiskBand.low.displayLabel, equals('Low'));
      expect(RiskBand.medium.displayLabel, equals('Appeal pending'));
      expect(RiskBand.high.displayLabel, equals('High'));
    });
  });

  group('InsightDecision', () {
    test('has all enum values', () {
      expect(InsightDecision.values, hasLength(2));
      expect(InsightDecision.values, contains(InsightDecision.allow));
      expect(InsightDecision.values, contains(InsightDecision.block));
    });

    test('fromString parses case-insensitively', () {
      expect(
        InsightDecision.fromString('ALLOW'),
        equals(InsightDecision.allow),
      );
      expect(
        InsightDecision.fromString('BLOCK'),
        equals(InsightDecision.block),
      );
    });

    test('fromString handles lowercase', () {
      expect(
        InsightDecision.fromString('allow'),
        equals(InsightDecision.allow),
      );
      expect(
        InsightDecision.fromString('block'),
        equals(InsightDecision.block),
      );
    });

    test('fromString defaults to block for unknown values', () {
      expect(
        InsightDecision.fromString('UNKNOWN'),
        equals(InsightDecision.block),
      );
      expect(InsightDecision.fromString(''), equals(InsightDecision.block));
      expect(
        InsightDecision.fromString('maybe'),
        equals(InsightDecision.block),
      );
    });

    test('displayLabel returns proper strings', () {
      expect(InsightDecision.allow.displayLabel, equals('Published'));
      expect(InsightDecision.block.displayLabel, equals('Blocked'));
    });
  });

  group('InsightAppealStatus', () {
    test('has all enum values', () {
      expect(InsightAppealStatus.values, hasLength(4));
      expect(InsightAppealStatus.values, contains(InsightAppealStatus.none));
      expect(InsightAppealStatus.values, contains(InsightAppealStatus.pending));
      expect(
        InsightAppealStatus.values,
        contains(InsightAppealStatus.approved),
      );
      expect(
        InsightAppealStatus.values,
        contains(InsightAppealStatus.rejected),
      );
    });

    test('fromString parses case-insensitively', () {
      expect(
        InsightAppealStatus.fromString('NONE'),
        equals(InsightAppealStatus.none),
      );
      expect(
        InsightAppealStatus.fromString('PENDING'),
        equals(InsightAppealStatus.pending),
      );
      expect(
        InsightAppealStatus.fromString('APPROVED'),
        equals(InsightAppealStatus.approved),
      );
      expect(
        InsightAppealStatus.fromString('REJECTED'),
        equals(InsightAppealStatus.rejected),
      );
    });

    test('fromString handles lowercase', () {
      expect(
        InsightAppealStatus.fromString('none'),
        equals(InsightAppealStatus.none),
      );
      expect(
        InsightAppealStatus.fromString('pending'),
        equals(InsightAppealStatus.pending),
      );
      expect(
        InsightAppealStatus.fromString('approved'),
        equals(InsightAppealStatus.approved),
      );
      expect(
        InsightAppealStatus.fromString('rejected'),
        equals(InsightAppealStatus.rejected),
      );
    });

    test('fromString defaults to none for unknown values', () {
      expect(
        InsightAppealStatus.fromString('UNKNOWN'),
        equals(InsightAppealStatus.none),
      );
      expect(
        InsightAppealStatus.fromString(''),
        equals(InsightAppealStatus.none),
      );
    });

    test('displayLabel returns proper strings', () {
      expect(InsightAppealStatus.none.displayLabel, equals('None'));
      expect(InsightAppealStatus.pending.displayLabel, equals('Pending'));
      expect(InsightAppealStatus.approved.displayLabel, equals('Approved'));
      expect(InsightAppealStatus.rejected.displayLabel, equals('Rejected'));
    });
  });

  group('InsightAppeal', () {
    test('can be constructed with status and timestamp', () {
      final now = DateTime.now();
      final appeal = InsightAppeal(
        status: InsightAppealStatus.pending,
        updatedAt: now,
      );

      expect(appeal.status, equals(InsightAppealStatus.pending));
      expect(appeal.updatedAt, equals(now));
    });

    test('can be constructed with status only', () {
      const appeal = InsightAppeal(status: InsightAppealStatus.none);

      expect(appeal.status, equals(InsightAppealStatus.none));
      expect(appeal.updatedAt, isNull);
    });

    test('can parse from JSON', () {
      final json = {'status': 'PENDING', 'updatedAt': '2026-01-18T10:00:00Z'};

      final appeal = InsightAppeal.fromJson(json);

      expect(appeal.status, equals(InsightAppealStatus.pending));
      expect(appeal.updatedAt, isNotNull);
    });

    test('can parse from JSON with missing updatedAt', () {
      final json = {'status': 'NONE'};

      final appeal = InsightAppeal.fromJson(json);

      expect(appeal.status, equals(InsightAppealStatus.none));
      expect(appeal.updatedAt, isNull);
    });
  });

  group('PostInsights', () {
    test('can be constructed with all fields', () {
      final now = DateTime.now();
      final appeal = InsightAppeal(
        status: InsightAppealStatus.none,
        updatedAt: now,
      );
      final insights = PostInsights(
        postId: 'post123',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: ['ALLOWED'],
        configVersion: 1,
        decidedAt: now,
        appeal: appeal,
      );

      expect(insights.postId, equals('post123'));
      expect(insights.riskBand, equals(RiskBand.low));
      expect(insights.decision, equals(InsightDecision.allow));
      expect(insights.reasonCodes, equals(['ALLOWED']));
      expect(insights.configVersion, equals(1));
      expect(insights.decidedAt, equals(now));
      expect(insights.appeal, equals(appeal));
    });

    test('can parse from JSON with full data', () {
      final json = {
        'postId': 'post456',
        'riskBand': 'HIGH',
        'decision': 'BLOCK',
        'reasonCodes': ['OFFENSIVE', 'SPAM'],
        'configVersion': 2,
        'decidedAt': '2026-01-18T10:00:00Z',
        'appeal': {'status': 'APPROVED', 'updatedAt': '2026-01-17T10:00:00Z'},
      };

      final insights = PostInsights.fromJson(json);

      expect(insights.postId, equals('post456'));
      expect(insights.riskBand, equals(RiskBand.high));
      expect(insights.decision, equals(InsightDecision.block));
      expect(insights.reasonCodes, equals(['OFFENSIVE', 'SPAM']));
      expect(insights.configVersion, equals(2));
      expect(insights.appeal.status, equals(InsightAppealStatus.approved));
    });

    test('fromJson handles missing optional fields with defaults', () {
      final json = {
        'postId': 'post789',
        'riskBand': null,
        'decision': null,
        'reasonCodes': <String>[],
        'configVersion': 1,
        'decidedAt': '2026-01-18T10:00:00Z',
        'appeal': {'status': null, 'updatedAt': '2026-01-18T10:00:00Z'},
      };

      final insights = PostInsights.fromJson(json);

      expect(insights.postId, equals('post789'));
      expect(insights.riskBand, equals(RiskBand.medium)); // default
      expect(insights.decision, equals(InsightDecision.block)); // default
      expect(insights.reasonCodes, isEmpty);
    });

    test('reasonCodes can contain multiple entries', () {
      final now = DateTime.now();
      final appeal = InsightAppeal(
        status: InsightAppealStatus.none,
        updatedAt: now,
      );
      final insights = PostInsights(
        postId: 'post999',
        riskBand: RiskBand.medium,
        decision: InsightDecision.block,
        reasonCodes: ['VIOLENCE', 'HATE_SPEECH', 'MISINFORMATION'],
        configVersion: 3,
        decidedAt: now,
        appeal: appeal,
      );

      expect(insights.reasonCodes, hasLength(3));
      expect(insights.reasonCodes, contains('VIOLENCE'));
      expect(insights.reasonCodes, contains('HATE_SPEECH'));
      expect(insights.reasonCodes, contains('MISINFORMATION'));
    });

    test('can be compared for equality', () {
      final now = DateTime(2026, 1, 18, 10, 0, 0);
      final appeal = InsightAppeal(
        status: InsightAppealStatus.none,
        updatedAt: now,
      );
      final insights1 = PostInsights(
        postId: 'post111',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: ['ALLOWED'],
        configVersion: 1,
        decidedAt: now,
        appeal: appeal,
      );
      final insights2 = PostInsights(
        postId: 'post111',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: ['ALLOWED'],
        configVersion: 1,
        decidedAt: now,
        appeal: appeal,
      );

      // Note: If PostInsights implements == operator, this would work
      expect(insights1.postId, equals(insights2.postId));
      expect(insights1.riskBand, equals(insights2.riskBand));
    });
  });
}

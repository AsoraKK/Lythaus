// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

void main() {
  // ── ModerationFilters ─────────────────────────────────────────────────
  group('ModerationFilters', () {
    test('defaults are all', () {
      const f = ModerationFilters();
      expect(f.itemType, ModerationItemFilter.all);
      expect(f.severity, ModerationSeverityFilter.all);
      expect(f.age, ModerationAgeFilter.all);
      expect(f.queue, ModerationQueueFilter.all);
    });

    test('copyWith overrides itemType', () {
      const f = ModerationFilters();
      final copy = f.copyWith(itemType: ModerationItemFilter.flag);
      expect(copy.itemType, ModerationItemFilter.flag);
      expect(copy.severity, ModerationSeverityFilter.all);
    });

    test('copyWith overrides severity', () {
      const f = ModerationFilters();
      final copy = f.copyWith(severity: ModerationSeverityFilter.high);
      expect(copy.severity, ModerationSeverityFilter.high);
    });

    test('copyWith overrides age', () {
      const f = ModerationFilters();
      final copy = f.copyWith(age: ModerationAgeFilter.underHour);
      expect(copy.age, ModerationAgeFilter.underHour);
    });

    test('copyWith overrides queue', () {
      const f = ModerationFilters();
      final copy = f.copyWith(queue: ModerationQueueFilter.escalated);
      expect(copy.queue, ModerationQueueFilter.escalated);
    });

    test('copyWith preserves unset fields', () {
      const f = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
        severity: ModerationSeverityFilter.low,
      );
      final copy = f.copyWith(age: ModerationAgeFilter.underDay);
      expect(copy.itemType, ModerationItemFilter.appeal);
      expect(copy.severity, ModerationSeverityFilter.low);
      expect(copy.age, ModerationAgeFilter.underDay);
    });
  });

  // ── toQueryParams ─────────────────────────────────────────────────────
  group('ModerationFilters.toQueryParams', () {
    test('empty when all defaults', () {
      const f = ModerationFilters();
      expect(f.toQueryParams(), isEmpty);
    });

    test('includes type when not all', () {
      const f = ModerationFilters(itemType: ModerationItemFilter.flag);
      final params = f.toQueryParams();
      expect(params['type'], 'flag');
    });

    test('includes severity when not all', () {
      const f = ModerationFilters(severity: ModerationSeverityFilter.medium);
      final params = f.toQueryParams();
      expect(params['severity'], 'medium');
    });

    test('includes age when underHour', () {
      const f = ModerationFilters(age: ModerationAgeFilter.underHour);
      final params = f.toQueryParams();
      expect(params['age'], '1h');
    });

    test('includes age when underDay', () {
      const f = ModerationFilters(age: ModerationAgeFilter.underDay);
      final params = f.toQueryParams();
      expect(params['age'], '24h');
    });

    test('includes age when underWeek', () {
      const f = ModerationFilters(age: ModerationAgeFilter.underWeek);
      final params = f.toQueryParams();
      expect(params['age'], '7d');
    });

    test('includes queue when defaultQueue', () {
      const f = ModerationFilters(queue: ModerationQueueFilter.defaultQueue);
      final params = f.toQueryParams();
      expect(params['queue'], 'default');
    });

    test('includes queue when escalated', () {
      const f = ModerationFilters(queue: ModerationQueueFilter.escalated);
      final params = f.toQueryParams();
      expect(params['queue'], 'escalated');
    });

    test('includes queue when policyTest', () {
      const f = ModerationFilters(queue: ModerationQueueFilter.policyTest);
      final params = f.toQueryParams();
      expect(params['queue'], 'policy-test');
    });

    test('includes all non-default params', () {
      const f = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
        severity: ModerationSeverityFilter.high,
        age: ModerationAgeFilter.underDay,
        queue: ModerationQueueFilter.escalated,
      );
      final params = f.toQueryParams();
      expect(params.length, 4);
      expect(params['type'], 'appeal');
      expect(params['severity'], 'high');
      expect(params['age'], '24h');
      expect(params['queue'], 'escalated');
    });
  });

  // ── ModerationAuditSearchFilters ──────────────────────────────────────
  group('ModerationAuditSearchFilters', () {
    test('defaults', () {
      const f = ModerationAuditSearchFilters();
      expect(f.action, ModerationAuditActionFilter.all);
      expect(f.page, 1);
      expect(f.pageSize, 20);
      expect(f.contentId, isNull);
      expect(f.userId, isNull);
      expect(f.moderatorId, isNull);
      expect(f.from, isNull);
      expect(f.to, isNull);
    });

    test('copyWith overrides action', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(action: ModerationAuditActionFilter.decision);
      expect(copy.action, ModerationAuditActionFilter.decision);
    });

    test('copyWith overrides page', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(page: 5);
      expect(copy.page, 5);
    });

    test('copyWith overrides pageSize', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(pageSize: 50);
      expect(copy.pageSize, 50);
    });

    test('copyWith overrides contentId', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(contentId: 'c1');
      expect(copy.contentId, 'c1');
    });

    test('copyWith overrides userId', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(userId: 'u1');
      expect(copy.userId, 'u1');
    });

    test('copyWith overrides moderatorId', () {
      const f = ModerationAuditSearchFilters();
      final copy = f.copyWith(moderatorId: 'm1');
      expect(copy.moderatorId, 'm1');
    });

    test('copyWith overrides from', () {
      const f = ModerationAuditSearchFilters();
      final d = DateTime(2025, 1, 1);
      final copy = f.copyWith(from: d);
      expect(copy.from, d);
    });

    test('copyWith overrides to', () {
      const f = ModerationAuditSearchFilters();
      final d = DateTime(2025, 6, 1);
      final copy = f.copyWith(to: d);
      expect(copy.to, d);
    });

    test('copyWith preserves unset fields', () {
      const f = ModerationAuditSearchFilters(
        action: ModerationAuditActionFilter.escalation,
        page: 3,
      );
      final copy = f.copyWith(page: 4);
      expect(copy.action, ModerationAuditActionFilter.escalation);
      expect(copy.page, 4);
    });

    test('toQueryParams includes page and pageSize', () {
      const f = ModerationAuditSearchFilters();
      final params = f.toQueryParams();
      expect(params['page'], 1);
      expect(params['pageSize'], 20);
    });

    test('toQueryParams includes contentId when set', () {
      const f = ModerationAuditSearchFilters(contentId: 'c1');
      expect(f.toQueryParams()['contentId'], 'c1');
    });

    test('toQueryParams excludes empty contentId', () {
      const f = ModerationAuditSearchFilters(contentId: '');
      expect(f.toQueryParams().containsKey('contentId'), isFalse);
    });

    test('toQueryParams includes userId when set', () {
      const f = ModerationAuditSearchFilters(userId: 'u1');
      expect(f.toQueryParams()['userId'], 'u1');
    });

    test('toQueryParams excludes empty userId', () {
      const f = ModerationAuditSearchFilters(userId: '');
      expect(f.toQueryParams().containsKey('userId'), isFalse);
    });

    test('toQueryParams includes moderatorId when set', () {
      const f = ModerationAuditSearchFilters(moderatorId: 'm1');
      expect(f.toQueryParams()['moderatorId'], 'm1');
    });

    test('toQueryParams includes action when not all', () {
      const f = ModerationAuditSearchFilters(
        action: ModerationAuditActionFilter.appeal,
      );
      expect(f.toQueryParams()['action'], 'appeal');
    });

    test('toQueryParams excludes action when all', () {
      const f = ModerationAuditSearchFilters();
      expect(f.toQueryParams().containsKey('action'), isFalse);
    });

    test('toQueryParams includes from date', () {
      final d = DateTime(2025, 1, 1);
      final f = ModerationAuditSearchFilters(from: d);
      expect(f.toQueryParams()['from'], d.toIso8601String());
    });

    test('toQueryParams includes to date', () {
      final d = DateTime(2025, 6, 1);
      final f = ModerationAuditSearchFilters(to: d);
      expect(f.toQueryParams()['to'], d.toIso8601String());
    });

    test('toQueryParams full example', () {
      final from = DateTime(2025, 1, 1);
      final to = DateTime(2025, 6, 1);
      final f = ModerationAuditSearchFilters(
        contentId: 'c1',
        userId: 'u1',
        moderatorId: 'm1',
        action: ModerationAuditActionFilter.aiSignal,
        from: from,
        to: to,
        page: 2,
        pageSize: 50,
      );
      final params = f.toQueryParams();
      expect(params.length, 8);
      expect(params['contentId'], 'c1');
      expect(params['action'], 'aiSignal');
    });
  });

  // ── Enum values ───────────────────────────────────────────────────────
  group('Filter enums', () {
    test('ModerationItemFilter values', () {
      expect(ModerationItemFilter.values.length, 3);
      expect(ModerationItemFilter.values, contains(ModerationItemFilter.all));
      expect(ModerationItemFilter.values, contains(ModerationItemFilter.flag));
      expect(
        ModerationItemFilter.values,
        contains(ModerationItemFilter.appeal),
      );
    });

    test('ModerationSeverityFilter values', () {
      expect(ModerationSeverityFilter.values.length, 4);
    });

    test('ModerationAgeFilter values', () {
      expect(ModerationAgeFilter.values.length, 4);
    });

    test('ModerationQueueFilter values', () {
      expect(ModerationQueueFilter.values.length, 4);
    });

    test('ModerationAuditActionFilter values', () {
      expect(ModerationAuditActionFilter.values.length, 5);
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.aiSignal),
      );
    });
  });
}

import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ModerationFilters', () {
    test('default constructor creates all filters', () {
      const filters = ModerationFilters();

      expect(filters.itemType, ModerationItemFilter.all);
      expect(filters.severity, ModerationSeverityFilter.all);
      expect(filters.age, ModerationAgeFilter.all);
      expect(filters.queue, ModerationQueueFilter.all);
    });

    test('copyWith updates specified fields', () {
      const filters = ModerationFilters();
      final updated = filters.copyWith(
        itemType: ModerationItemFilter.flag,
        severity: ModerationSeverityFilter.high,
      );

      expect(updated.itemType, ModerationItemFilter.flag);
      expect(updated.severity, ModerationSeverityFilter.high);
      expect(updated.age, ModerationAgeFilter.all);
      expect(updated.queue, ModerationQueueFilter.all);
    });

    test('copyWith preserves unmodified fields', () {
      const filters = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
        severity: ModerationSeverityFilter.medium,
        age: ModerationAgeFilter.underDay,
        queue: ModerationQueueFilter.escalated,
      );
      final updated = filters.copyWith(severity: ModerationSeverityFilter.low);

      expect(updated.itemType, ModerationItemFilter.appeal);
      expect(updated.severity, ModerationSeverityFilter.low);
      expect(updated.age, ModerationAgeFilter.underDay);
      expect(updated.queue, ModerationQueueFilter.escalated);
    });

    test('toQueryParams returns empty map when all filters are all', () {
      const filters = ModerationFilters();
      final params = filters.toQueryParams();

      expect(params, isEmpty);
    });

    test('toQueryParams includes itemType when not all', () {
      const filters = ModerationFilters(itemType: ModerationItemFilter.flag);
      final params = filters.toQueryParams();

      expect(params['type'], 'flag');
    });

    test('toQueryParams includes severity when not all', () {
      const filters = ModerationFilters(
        severity: ModerationSeverityFilter.high,
      );
      final params = filters.toQueryParams();

      expect(params['severity'], 'high');
    });

    test('toQueryParams includes age with correct format', () {
      const filters1 = ModerationFilters(age: ModerationAgeFilter.underHour);
      expect(filters1.toQueryParams()['age'], '1h');

      const filters2 = ModerationFilters(age: ModerationAgeFilter.underDay);
      expect(filters2.toQueryParams()['age'], '24h');

      const filters3 = ModerationFilters(age: ModerationAgeFilter.underWeek);
      expect(filters3.toQueryParams()['age'], '7d');
    });

    test('toQueryParams includes queue with correct format', () {
      const filters1 = ModerationFilters(
        queue: ModerationQueueFilter.defaultQueue,
      );
      expect(filters1.toQueryParams()['queue'], 'default');

      const filters2 = ModerationFilters(
        queue: ModerationQueueFilter.escalated,
      );
      expect(filters2.toQueryParams()['queue'], 'escalated');

      const filters3 = ModerationFilters(
        queue: ModerationQueueFilter.policyTest,
      );
      expect(filters3.toQueryParams()['queue'], 'policy-test');
    });

    test('toQueryParams includes all non-all filters', () {
      const filters = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
        severity: ModerationSeverityFilter.medium,
        age: ModerationAgeFilter.underDay,
        queue: ModerationQueueFilter.escalated,
      );
      final params = filters.toQueryParams();

      expect(params['type'], 'appeal');
      expect(params['severity'], 'medium');
      expect(params['age'], '24h');
      expect(params['queue'], 'escalated');
    });
  });

  group('ModerationAuditSearchFilters', () {
    test('default constructor creates filters with defaults', () {
      const filters = ModerationAuditSearchFilters();

      expect(filters.contentId, isNull);
      expect(filters.userId, isNull);
      expect(filters.moderatorId, isNull);
      expect(filters.action, ModerationAuditActionFilter.all);
      expect(filters.from, isNull);
      expect(filters.to, isNull);
      expect(filters.page, 1);
      expect(filters.pageSize, 20);
    });

    test('constructor accepts all parameters', () {
      final from = DateTime(2024, 1, 1);
      final to = DateTime(2024, 1, 31);
      final filters = ModerationAuditSearchFilters(
        contentId: 'post-123',
        userId: 'user-456',
        moderatorId: 'mod-789',
        action: ModerationAuditActionFilter.decision,
        from: from,
        to: to,
        page: 2,
        pageSize: 50,
      );

      expect(filters.contentId, 'post-123');
      expect(filters.userId, 'user-456');
      expect(filters.moderatorId, 'mod-789');
      expect(filters.action, ModerationAuditActionFilter.decision);
      expect(filters.from, from);
      expect(filters.to, to);
      expect(filters.page, 2);
      expect(filters.pageSize, 50);
    });

    test('copyWith updates specified fields', () {
      const filters = ModerationAuditSearchFilters(contentId: 'post-1');
      final updated = filters.copyWith(userId: 'user-2', page: 3);

      expect(updated.contentId, 'post-1');
      expect(updated.userId, 'user-2');
      expect(updated.page, 3);
      expect(updated.pageSize, 20);
    });

    test('copyWith preserves fields when not provided', () {
      final from = DateTime(2024, 1, 1);
      final filters = ModerationAuditSearchFilters(
        contentId: 'post-1',
        from: from,
        page: 5,
      );
      final updated = filters.copyWith(pageSize: 100);

      expect(updated.contentId, 'post-1');
      expect(updated.from, from);
      expect(updated.page, 5);
      expect(updated.pageSize, 100);
    });

    test('toQueryParams always includes page and pageSize', () {
      const filters = ModerationAuditSearchFilters();
      final params = filters.toQueryParams();

      expect(params['page'], 1);
      expect(params['pageSize'], 20);
    });

    test('toQueryParams includes contentId when set', () {
      const filters = ModerationAuditSearchFilters(contentId: 'post-123');
      final params = filters.toQueryParams();

      expect(params['contentId'], 'post-123');
    });

    test('toQueryParams includes userId when set', () {
      const filters = ModerationAuditSearchFilters(userId: 'user-456');
      final params = filters.toQueryParams();

      expect(params['userId'], 'user-456');
    });

    test('toQueryParams includes moderatorId when set', () {
      const filters = ModerationAuditSearchFilters(moderatorId: 'mod-789');
      final params = filters.toQueryParams();

      expect(params['moderatorId'], 'mod-789');
    });

    test('toQueryParams includes action when not all', () {
      const filters = ModerationAuditSearchFilters(
        action: ModerationAuditActionFilter.decision,
      );
      final params = filters.toQueryParams();

      expect(params['action'], 'decision');
    });

    test('toQueryParams includes from date when set', () {
      final from = DateTime(2024, 1, 1, 10, 30);
      final filters = ModerationAuditSearchFilters(from: from);
      final params = filters.toQueryParams();

      expect(params['from'], from.toIso8601String());
    });

    test('toQueryParams includes to date when set', () {
      final to = DateTime(2024, 1, 31, 23, 59);
      final filters = ModerationAuditSearchFilters(to: to);
      final params = filters.toQueryParams();

      expect(params['to'], to.toIso8601String());
    });

    test('toQueryParams includes page when not 1', () {
      const filters = ModerationAuditSearchFilters(page: 3);
      final params = filters.toQueryParams();

      expect(params['page'], 3);
    });

    test('toQueryParams includes pageSize as limit', () {
      const filters = ModerationAuditSearchFilters(pageSize: 50);
      final params = filters.toQueryParams();

      expect(params['pageSize'], 50);
    });

    test('toQueryParams includes all set parameters', () {
      final from = DateTime(2024, 1, 1);
      final to = DateTime(2024, 1, 31);
      final filters = ModerationAuditSearchFilters(
        contentId: 'post-123',
        userId: 'user-456',
        moderatorId: 'mod-789',
        action: ModerationAuditActionFilter.escalation,
        from: from,
        to: to,
        page: 2,
        pageSize: 100,
      );
      final params = filters.toQueryParams();

      expect(params['contentId'], 'post-123');
      expect(params['userId'], 'user-456');
      expect(params['moderatorId'], 'mod-789');
      expect(params['action'], 'escalation');
      expect(params['from'], from.toIso8601String());
      expect(params['to'], to.toIso8601String());
      expect(params['page'], 2);
      expect(params['pageSize'], 100);
    });
  });

  group('Filter Enums', () {
    test('ModerationItemFilter has all expected values', () {
      expect(ModerationItemFilter.values, contains(ModerationItemFilter.all));
      expect(ModerationItemFilter.values, contains(ModerationItemFilter.flag));
      expect(
        ModerationItemFilter.values,
        contains(ModerationItemFilter.appeal),
      );
    });

    test('ModerationSeverityFilter has all expected values', () {
      expect(
        ModerationSeverityFilter.values,
        contains(ModerationSeverityFilter.all),
      );
      expect(
        ModerationSeverityFilter.values,
        contains(ModerationSeverityFilter.low),
      );
      expect(
        ModerationSeverityFilter.values,
        contains(ModerationSeverityFilter.medium),
      );
      expect(
        ModerationSeverityFilter.values,
        contains(ModerationSeverityFilter.high),
      );
    });

    test('ModerationAgeFilter has all expected values', () {
      expect(ModerationAgeFilter.values, contains(ModerationAgeFilter.all));
      expect(
        ModerationAgeFilter.values,
        contains(ModerationAgeFilter.underHour),
      );
      expect(
        ModerationAgeFilter.values,
        contains(ModerationAgeFilter.underDay),
      );
      expect(
        ModerationAgeFilter.values,
        contains(ModerationAgeFilter.underWeek),
      );
    });

    test('ModerationQueueFilter has all expected values', () {
      expect(ModerationQueueFilter.values, contains(ModerationQueueFilter.all));
      expect(
        ModerationQueueFilter.values,
        contains(ModerationQueueFilter.defaultQueue),
      );
      expect(
        ModerationQueueFilter.values,
        contains(ModerationQueueFilter.escalated),
      );
      expect(
        ModerationQueueFilter.values,
        contains(ModerationQueueFilter.policyTest),
      );
    });

    test('ModerationAuditActionFilter has all expected values', () {
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.all),
      );
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.decision),
      );
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.escalation),
      );
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.appeal),
      );
      expect(
        ModerationAuditActionFilter.values,
        contains(ModerationAuditActionFilter.aiSignal),
      );
    });
  });
}

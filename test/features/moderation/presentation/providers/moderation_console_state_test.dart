import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

void main() {
  group('ModerationQueueState', () {
    test('default values', () {
      const s = ModerationQueueState();
      expect(s.items, isEmpty);
      expect(s.page, 1);
      expect(s.pageSize, 20);
      expect(s.hasMore, isTrue);
      expect(s.errorMessage, isNull);
      expect(s.isLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.isRefreshing, isFalse);
    });

    test('copyWith overrides fields', () {
      const s = ModerationQueueState();
      final s2 = s.copyWith(
        page: 3,
        hasMore: false,
        isLoading: true,
        errorMessage: 'oops',
      );
      expect(s2.page, 3);
      expect(s2.hasMore, isFalse);
      expect(s2.isLoading, isTrue);
      expect(s2.errorMessage, 'oops');
      expect(s2.items, isEmpty); // preserved
      expect(s2.pageSize, 20); // preserved
    });

    test('copyWith preserves original without args', () {
      final s = const ModerationQueueState().copyWith(
        page: 5,
        isLoadingMore: true,
        isRefreshing: true,
      );
      final s2 = s.copyWith();
      expect(s2.page, 5);
      expect(s2.isLoadingMore, isTrue);
      expect(s2.isRefreshing, isTrue);
    });

    test('copyWith with filters', () {
      const s = ModerationQueueState();
      final s2 = s.copyWith(
        filters: const ModerationFilters(
          severity: ModerationSeverityFilter.high,
        ),
      );
      expect(s2.filters.severity, ModerationSeverityFilter.high);
    });
  });

  group('ModerationCaseState', () {
    test('default values', () {
      const s = ModerationCaseState();
      expect(s.caseDetail, isNull);
      expect(s.isLoading, isFalse);
      expect(s.errorMessage, isNull);
      expect(s.decisionSubmitting, isFalse);
      expect(s.escalating, isFalse);
    });

    test('copyWith overrides fields', () {
      const s = ModerationCaseState();
      final s2 = s.copyWith(
        isLoading: true,
        errorMessage: 'error',
        decisionSubmitting: true,
        escalating: true,
      );
      expect(s2.isLoading, isTrue);
      expect(s2.errorMessage, 'error');
      expect(s2.decisionSubmitting, isTrue);
      expect(s2.escalating, isTrue);
    });

    test('copyWith preserves fields', () {
      final s = const ModerationCaseState().copyWith(decisionSubmitting: true);
      final s2 = s.copyWith(escalating: true);
      expect(s2.decisionSubmitting, isTrue); // preserved
      expect(s2.escalating, isTrue);
    });
  });

  group('ModerationAuditState', () {
    test('default values', () {
      const s = ModerationAuditState();
      expect(s.entries, isEmpty);
      expect(s.page, 1);
      expect(s.pageSize, 20);
      expect(s.hasMore, isTrue);
      expect(s.isLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.errorMessage, isNull);
    });

    test('copyWith overrides fields', () {
      const s = ModerationAuditState();
      final s2 = s.copyWith(
        page: 2,
        hasMore: false,
        isLoading: true,
        isLoadingMore: true,
        errorMessage: 'fail',
      );
      expect(s2.page, 2);
      expect(s2.hasMore, isFalse);
      expect(s2.isLoading, isTrue);
      expect(s2.isLoadingMore, isTrue);
      expect(s2.errorMessage, 'fail');
    });

    test('copyWith preserves original without args', () {
      final s = const ModerationAuditState().copyWith(
        page: 3,
        pageSize: 50,
        isLoading: true,
      );
      final s2 = s.copyWith();
      expect(s2.page, 3);
      expect(s2.pageSize, 50);
      expect(s2.isLoading, isTrue);
    });

    test('copyWith with filters', () {
      const s = ModerationAuditState();
      final s2 = s.copyWith(
        filters: const ModerationAuditSearchFilters(page: 2),
      );
      expect(s2.filters.page, 2);
    });
  });
}

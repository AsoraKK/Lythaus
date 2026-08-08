import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

void main() {
  // ─── ModerationQueueState ───
  group('ModerationQueueState', () {
    test('default state', () {
      const s = ModerationQueueState();
      expect(s.items, isEmpty);
      expect(s.page, 1);
      expect(s.pageSize, 20);
      expect(s.hasMore, isTrue);
      expect(s.errorMessage, isNull);
      expect(s.isLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.isRefreshing, isFalse);
      expect(s.filters, isA<ModerationFilters>());
    });

    test('copyWith preserves defaults', () {
      const s = ModerationQueueState();
      final copy = s.copyWith();
      expect(copy.items, isEmpty);
      expect(copy.page, 1);
      expect(copy.pageSize, 20);
      expect(copy.hasMore, isTrue);
      expect(copy.isLoading, isFalse);
    });

    test('copyWith overrides fields', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(
        page: 3,
        pageSize: 50,
        hasMore: false,
        errorMessage: 'err',
        isLoading: true,
        isLoadingMore: true,
        isRefreshing: true,
      );
      expect(copy.page, 3);
      expect(copy.pageSize, 50);
      expect(copy.hasMore, isFalse);
      expect(copy.errorMessage, 'err');
      expect(copy.isLoading, isTrue);
      expect(copy.isLoadingMore, isTrue);
      expect(copy.isRefreshing, isTrue);
    });

    test('copyWith clears errorMessage when set to null', () {
      const s = ModerationQueueState(errorMessage: 'old error');
      // errorMessage is nullable; passing null via copyWith should clear it
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith with items', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(items: []);
      expect(copy.items, isEmpty);
    });

    test('copyWith with filters', () {
      const s = ModerationQueueState();
      const newFilters = ModerationFilters(
        itemType: ModerationItemFilter.appeal,
      );
      final copy = s.copyWith(filters: newFilters);
      expect(copy.filters.itemType, ModerationItemFilter.appeal);
    });
  });

  // ─── ModerationCaseState ───
  group('ModerationCaseState', () {
    test('default state', () {
      const s = ModerationCaseState();
      expect(s.caseDetail, isNull);
      expect(s.isLoading, isFalse);
      expect(s.errorMessage, isNull);
      expect(s.decisionSubmitting, isFalse);
      expect(s.escalating, isFalse);
    });

    test('copyWith preserves defaults', () {
      const s = ModerationCaseState();
      final copy = s.copyWith();
      expect(copy.caseDetail, isNull);
      expect(copy.isLoading, isFalse);
      expect(copy.errorMessage, isNull);
      expect(copy.decisionSubmitting, isFalse);
      expect(copy.escalating, isFalse);
    });

    test('copyWith overrides fields', () {
      const s = ModerationCaseState();
      final copy = s.copyWith(
        isLoading: true,
        errorMessage: 'error',
        decisionSubmitting: true,
        escalating: true,
      );
      expect(copy.isLoading, isTrue);
      expect(copy.errorMessage, 'error');
      expect(copy.decisionSubmitting, isTrue);
      expect(copy.escalating, isTrue);
    });

    test('copyWith clears errorMessage', () {
      const s = ModerationCaseState(errorMessage: 'old');
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });
  });

  // ─── ModerationAuditState ───
  group('ModerationAuditState', () {
    test('default state', () {
      const s = ModerationAuditState();
      expect(s.entries, isEmpty);
      expect(s.page, 1);
      expect(s.pageSize, 20);
      expect(s.hasMore, isTrue);
      expect(s.isLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.errorMessage, isNull);
      expect(s.filters, isA<ModerationAuditSearchFilters>());
    });

    test('copyWith preserves defaults', () {
      const s = ModerationAuditState();
      final copy = s.copyWith();
      expect(copy.entries, isEmpty);
      expect(copy.page, 1);
      expect(copy.pageSize, 20);
      expect(copy.hasMore, isTrue);
    });

    test('copyWith overrides fields', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(
        page: 5,
        pageSize: 100,
        hasMore: false,
        isLoading: true,
        isLoadingMore: true,
        errorMessage: 'fail',
      );
      expect(copy.page, 5);
      expect(copy.pageSize, 100);
      expect(copy.hasMore, isFalse);
      expect(copy.isLoading, isTrue);
      expect(copy.isLoadingMore, isTrue);
      expect(copy.errorMessage, 'fail');
    });

    test('copyWith with entries', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(entries: []);
      expect(copy.entries, isEmpty);
    });

    test('copyWith with filters', () {
      const s = ModerationAuditState();
      const newFilters = ModerationAuditSearchFilters(
        action: ModerationAuditActionFilter.all,
      );
      final copy = s.copyWith(filters: newFilters);
      expect(copy.filters.action, ModerationAuditActionFilter.all);
    });

    test('copyWith clears error', () {
      const s = ModerationAuditState(errorMessage: 'old');
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });
  });
}

// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

void main() {
  // ── ModerationQueueState ──────────────────────────────────────────────
  group('ModerationQueueState', () {
    test('defaults', () {
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

    test('copyWith overrides page', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(page: 3);
      expect(copy.page, 3);
    });

    test('copyWith overrides pageSize', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(pageSize: 50);
      expect(copy.pageSize, 50);
    });

    test('copyWith overrides hasMore', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(hasMore: false);
      expect(copy.hasMore, isFalse);
    });

    test('copyWith overrides errorMessage', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(errorMessage: 'fail');
      expect(copy.errorMessage, 'fail');
    });

    test('copyWith clears errorMessage to null', () {
      const s = ModerationQueueState(errorMessage: 'err');
      // In the copyWith impl, passing errorMessage: null should reset
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith overrides isLoading', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(isLoading: true);
      expect(copy.isLoading, isTrue);
    });

    test('copyWith overrides isLoadingMore', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(isLoadingMore: true);
      expect(copy.isLoadingMore, isTrue);
    });

    test('copyWith overrides isRefreshing', () {
      const s = ModerationQueueState();
      final copy = s.copyWith(isRefreshing: true);
      expect(copy.isRefreshing, isTrue);
    });

    test('copyWith overrides filters', () {
      const s = ModerationQueueState();
      const newFilters = ModerationFilters(itemType: ModerationItemFilter.flag);
      final copy = s.copyWith(filters: newFilters);
      expect(copy.filters.itemType, ModerationItemFilter.flag);
    });

    test('copyWith preserves unset fields', () {
      const s = ModerationQueueState(page: 5, pageSize: 30, hasMore: false);
      final copy = s.copyWith(page: 6);
      expect(copy.pageSize, 30);
      expect(copy.hasMore, isFalse);
    });
  });

  // ── ModerationCaseState ───────────────────────────────────────────────
  group('ModerationCaseState', () {
    test('defaults', () {
      const s = ModerationCaseState();
      expect(s.caseDetail, isNull);
      expect(s.isLoading, isFalse);
      expect(s.errorMessage, isNull);
      expect(s.decisionSubmitting, isFalse);
      expect(s.escalating, isFalse);
    });

    test('copyWith overrides isLoading', () {
      const s = ModerationCaseState();
      final copy = s.copyWith(isLoading: true);
      expect(copy.isLoading, isTrue);
    });

    test('copyWith overrides errorMessage', () {
      const s = ModerationCaseState();
      final copy = s.copyWith(errorMessage: 'not found');
      expect(copy.errorMessage, 'not found');
    });

    test('copyWith clears errorMessage', () {
      const s = ModerationCaseState(errorMessage: 'err');
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith overrides decisionSubmitting', () {
      const s = ModerationCaseState();
      final copy = s.copyWith(decisionSubmitting: true);
      expect(copy.decisionSubmitting, isTrue);
    });

    test('copyWith overrides escalating', () {
      const s = ModerationCaseState();
      final copy = s.copyWith(escalating: true);
      expect(copy.escalating, isTrue);
    });

    test('copyWith preserves unset fields', () {
      const s = ModerationCaseState(isLoading: true, decisionSubmitting: true);
      final copy = s.copyWith(escalating: true);
      expect(copy.isLoading, isTrue);
      expect(copy.decisionSubmitting, isTrue);
      expect(copy.escalating, isTrue);
    });
  });

  // ── ModerationAuditState ──────────────────────────────────────────────
  group('ModerationAuditState', () {
    test('defaults', () {
      const s = ModerationAuditState();
      expect(s.entries, isEmpty);
      expect(s.page, 1);
      expect(s.pageSize, 20);
      expect(s.hasMore, isTrue);
      expect(s.isLoading, isFalse);
      expect(s.isLoadingMore, isFalse);
      expect(s.errorMessage, isNull);
    });

    test('copyWith overrides page', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(page: 2);
      expect(copy.page, 2);
    });

    test('copyWith overrides pageSize', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(pageSize: 50);
      expect(copy.pageSize, 50);
    });

    test('copyWith overrides hasMore', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(hasMore: false);
      expect(copy.hasMore, isFalse);
    });

    test('copyWith overrides isLoading', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(isLoading: true);
      expect(copy.isLoading, isTrue);
    });

    test('copyWith overrides isLoadingMore', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(isLoadingMore: true);
      expect(copy.isLoadingMore, isTrue);
    });

    test('copyWith overrides errorMessage', () {
      const s = ModerationAuditState();
      final copy = s.copyWith(errorMessage: 'error');
      expect(copy.errorMessage, 'error');
    });

    test('copyWith clears errorMessage', () {
      const s = ModerationAuditState(errorMessage: 'x');
      final copy = s.copyWith(errorMessage: null);
      expect(copy.errorMessage, isNull);
    });

    test('copyWith preserves unset fields', () {
      const s = ModerationAuditState(page: 3, hasMore: false);
      final copy = s.copyWith(isLoading: true);
      expect(copy.page, 3);
      expect(copy.hasMore, isFalse);
    });
  });
}

// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class MockModerationRepository extends Mock implements ModerationRepository {}

void main() {
  group('ModerationQueueState', () {
    test('default constructor creates expected state', () {
      const state = ModerationQueueState();
      expect(state.items, isEmpty);
      expect(state.page, 1);
      expect(state.pageSize, 20);
      expect(state.hasMore, isTrue);
      expect(state.errorMessage, isNull);
      expect(state.isLoading, isFalse);
      expect(state.isLoadingMore, isFalse);
      expect(state.isRefreshing, isFalse);
    });

    test('copyWith preserves fields when no overrides', () {
      const state = ModerationQueueState(
        page: 3,
        pageSize: 50,
        hasMore: false,
        errorMessage: 'err',
        isLoading: true,
      );
      final copied = state.copyWith();
      expect(copied.page, 3);
      expect(copied.pageSize, 50);
      expect(copied.hasMore, isFalse);
      // errorMessage is nulled by default (copyWith uses positional null)
      expect(copied.isLoading, isTrue);
    });

    test('copyWith overrides individual fields', () {
      const state = ModerationQueueState();
      final updated = state.copyWith(
        page: 5,
        isLoading: true,
        hasMore: false,
        errorMessage: 'oops',
      );
      expect(updated.page, 5);
      expect(updated.isLoading, isTrue);
      expect(updated.hasMore, isFalse);
      expect(updated.errorMessage, 'oops');
    });
  });

  group('ModerationCaseState', () {
    test('default constructor creates expected state', () {
      const state = ModerationCaseState();
      expect(state.caseDetail, isNull);
      expect(state.isLoading, isFalse);
      expect(state.errorMessage, isNull);
      expect(state.decisionSubmitting, isFalse);
      expect(state.escalating, isFalse);
    });

    test('copyWith overrides individual fields', () {
      const state = ModerationCaseState();
      final updated = state.copyWith(
        isLoading: true,
        decisionSubmitting: true,
        escalating: true,
        errorMessage: 'fail',
      );
      expect(updated.isLoading, isTrue);
      expect(updated.decisionSubmitting, isTrue);
      expect(updated.escalating, isTrue);
      expect(updated.errorMessage, 'fail');
    });

    test('copyWith clears errorMessage when not provided', () {
      const state = ModerationCaseState(errorMessage: 'old error');
      final updated = state.copyWith(isLoading: false);
      expect(updated.errorMessage, isNull);
    });
  });

  group('ModerationAuditState', () {
    test('default constructor creates expected state', () {
      const state = ModerationAuditState();
      expect(state.entries, isEmpty);
      expect(state.page, 1);
      expect(state.pageSize, 20);
      expect(state.hasMore, isTrue);
      expect(state.isLoading, isFalse);
      expect(state.isLoadingMore, isFalse);
      expect(state.errorMessage, isNull);
    });

    test('copyWith preserves fields when no overrides', () {
      const state = ModerationAuditState(
        page: 2,
        pageSize: 30,
        hasMore: false,
        isLoading: true,
      );
      final copied = state.copyWith();
      expect(copied.page, 2);
      expect(copied.pageSize, 30);
      expect(copied.hasMore, isFalse);
      expect(copied.isLoading, isTrue);
    });

    test('copyWith overrides individual fields', () {
      const state = ModerationAuditState();
      final updated = state.copyWith(
        page: 3,
        hasMore: false,
        isLoadingMore: true,
        errorMessage: 'timeout',
      );
      expect(updated.page, 3);
      expect(updated.hasMore, isFalse);
      expect(updated.isLoadingMore, isTrue);
      expect(updated.errorMessage, 'timeout');
    });

    test('copyWith clears errorMessage when not provided', () {
      const state = ModerationAuditState(errorMessage: 'old');
      final updated = state.copyWith(isLoading: false);
      expect(updated.errorMessage, isNull);
    });
  });
}

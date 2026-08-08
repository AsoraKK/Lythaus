import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

void main() {
  // ────── PostCreationState ──────

  group('PostCreationState', () {
    test('default values', () {
      const state = PostCreationState();
      expect(state.text, '');
      expect(state.mediaUrl, isNull);
      expect(state.isSubmitting, isFalse);
      expect(state.result, isNull);
      expect(state.validationError, isNull);
      expect(state.isNews, isFalse);
      expect(state.contentType, 'text');
      expect(state.aiLabel, isNull);
    });

    test('copyWith preserves values', () {
      const state = PostCreationState(text: 'hello', isNews: true);
      final copy = state.copyWith(mediaUrl: 'http://img.png');
      expect(copy.text, 'hello');
      expect(copy.isNews, isTrue);
      expect(copy.mediaUrl, 'http://img.png');
    });

    test('copyWith clearMediaUrl clears media', () {
      const state = PostCreationState(mediaUrl: 'http://img.png');
      final copy = state.copyWith(clearMediaUrl: true);
      expect(copy.mediaUrl, isNull);
    });

    test('copyWith clearResult clears result', () {
      const state = PostCreationState(result: CreatePostError(message: 'err'));
      final copy = state.copyWith(clearResult: true);
      expect(copy.result, isNull);
    });

    test('copyWith clearValidationError clears validation error', () {
      const state = PostCreationState(validationError: 'too short');
      final copy = state.copyWith(clearValidationError: true);
      expect(copy.validationError, isNull);
    });

    test('isValid returns true when text is not empty and within limit', () {
      const state = PostCreationState(text: 'hello', aiLabel: 'human');
      expect(state.isValid, isTrue);
    });

    test('isValid returns false when text is empty', () {
      const state = PostCreationState(text: '');
      expect(state.isValid, isFalse);
    });

    test('isValid returns false when text exceeds 5000 chars', () {
      final state = PostCreationState(text: 'a' * 5001);
      expect(state.isValid, isFalse);
    });

    test('isSuccess returns true for CreatePostSuccess', () {
      final state = PostCreationState(
        result: CreatePostSuccess(
          Post(
            id: '1',
            text: 'hi',
            authorId: 'a',
            authorUsername: 'u',
            createdAt: DateTime(2024),
          ),
        ),
      );
      expect(state.isSuccess, isTrue);
      expect(state.successResult, isNotNull);
    });

    test('isBlocked returns true for CreatePostBlocked', () {
      const state = PostCreationState(
        result: CreatePostBlocked(
          message: 'blocked',
          categories: ['hate'],
          code: 'BLOCKED',
        ),
      );
      expect(state.isBlocked, isTrue);
      expect(state.blockedResult, isNotNull);
    });

    test('isLimitExceeded returns true for CreatePostLimitExceeded', () {
      const state = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 1),
        ),
      );
      expect(state.isLimitExceeded, isTrue);
      expect(state.limitExceededResult, isNotNull);
    });

    test('hasError returns true for CreatePostError', () {
      const state = PostCreationState(
        result: CreatePostError(message: 'err', code: 'CODE'),
      );
      expect(state.hasError, isTrue);
      expect(state.errorResult, isNotNull);
    });

    test('getters return null when result is different type', () {
      const state = PostCreationState();
      expect(state.successResult, isNull);
      expect(state.blockedResult, isNull);
      expect(state.limitExceededResult, isNull);
      expect(state.errorResult, isNull);
      expect(state.isSuccess, isFalse);
      expect(state.isBlocked, isFalse);
      expect(state.isLimitExceeded, isFalse);
      expect(state.hasError, isFalse);
    });
  });

  // ────── PostCreationState.proofSignals handling ──────

  group('PostCreationState proof signals', () {
    test('copyWith with proofSignals', () {
      const state = PostCreationState();
      final copy = state.copyWith(
        proofSignals: const ProofSignals(
          captureMetadataHash: 'h1',
          editHistoryHash: 'h2',
          sourceAttestationUrl: 'url',
        ),
      );
      expect(copy.proofSignals.captureMetadataHash, 'h1');
      expect(copy.proofSignals.editHistoryHash, 'h2');
      expect(copy.proofSignals.sourceAttestationUrl, 'url');
    });
  });

  // ────── Constants ──────

  group('constants', () {
    test('postTextMinLength is 1', () {
      expect(postTextMinLength, 1);
    });

    test('postTextMaxLength is 5000', () {
      expect(postTextMaxLength, 5000);
    });
  });
}

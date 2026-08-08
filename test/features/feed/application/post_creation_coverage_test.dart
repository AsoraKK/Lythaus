import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';

void main() {
  group('PostCreationState', () {
    test('default values', () {
      const s = PostCreationState();
      expect(s.text, '');
      expect(s.mediaUrl, isNull);
      expect(s.isSubmitting, isFalse);
      expect(s.result, isNull);
      expect(s.validationError, isNull);
      expect(s.isNews, isFalse);
      expect(s.contentType, 'text');
      expect(s.aiLabel, isNull);
      expect(s.proofSignals.hasAny, isFalse);
    });

    test('isValid checks text not empty and under 5000 chars', () {
      const empty = PostCreationState(text: '');
      expect(empty.isValid, isFalse);

      const ok = PostCreationState(text: 'hello', aiLabel: 'human');
      expect(ok.isValid, isTrue);

      final tooLong = PostCreationState(text: 'a' * 5001);
      expect(tooLong.isValid, isFalse);
    });

    test('isSuccess checks result type', () {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'u',
        text: 'hi',
        createdAt: DateTime.now(),
      );
      final s = PostCreationState(result: CreatePostSuccess(post));
      expect(s.isSuccess, isTrue);
      expect(s.isBlocked, isFalse);
      expect(s.isLimitExceeded, isFalse);
      expect(s.hasError, isFalse);
      expect(s.successResult, isNotNull);
      expect(s.blockedResult, isNull);
      expect(s.limitExceededResult, isNull);
      expect(s.errorResult, isNull);
    });

    test('isBlocked checks result type', () {
      const s = PostCreationState(
        result: CreatePostBlocked(message: 'blocked', categories: ['hate']),
      );
      expect(s.isBlocked, isTrue);
      expect(s.isSuccess, isFalse);
      expect(s.blockedResult, isNotNull);
      expect(s.blockedResult!.message, 'blocked');
    });

    test('isLimitExceeded checks result type', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 24),
        ),
      );
      expect(s.isLimitExceeded, isTrue);
      expect(s.limitExceededResult, isNotNull);
      expect(s.limitExceededResult!.limit, 10);
    });

    test('hasError checks result type', () {
      const s = PostCreationState(result: CreatePostError(message: 'fail'));
      expect(s.hasError, isTrue);
      expect(s.errorResult, isNotNull);
      expect(s.errorResult!.message, 'fail');
    });

    test('copyWith overrides and clears correctly', () {
      const s = PostCreationState(
        text: 'hello',
        mediaUrl: 'img.png',
        isSubmitting: true,
        result: CreatePostError(message: 'fail'),
        validationError: 'err',
      );

      final s2 = s.copyWith(
        text: 'new',
        clearMediaUrl: true,
        clearResult: true,
        clearValidationError: true,
      );
      expect(s2.text, 'new');
      expect(s2.mediaUrl, isNull);
      expect(s2.result, isNull);
      expect(s2.validationError, isNull);
    });

    test('copyWith preserves fields when not overridden', () {
      const s = PostCreationState(
        text: 'hello',
        isNews: true,
        contentType: 'image',
        aiLabel: 'assisted',
        proofSignals: ProofSignals(captureMetadataHash: 'h'),
      );
      final s2 = s.copyWith();
      expect(s2.text, 'hello');
      expect(s2.isNews, isTrue);
      expect(s2.contentType, 'image');
      expect(s2.aiLabel, 'assisted');
      expect(s2.proofSignals.captureMetadataHash, 'h');
    });
  });

  group('PostCreationNotifier (unit)', () {
    // We cannot fully test the notifier without Riverpod container,
    // but we can test the validate() method indirectly via state

    test('validate returns null for valid text', () {
      // Validate is a method on the notifier, which needs Ref.
      // Instead test PostCreationState.isValid which mirrors validate logic.
      const s = PostCreationState(text: 'Valid post', aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('isValid false for empty text with whitespace', () {
      const s = PostCreationState(text: '   ');
      expect(s.isValid, isFalse);
    });

    test('isValid true at exactly 5000 chars', () {
      final s = PostCreationState(text: 'a' * 5000, aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('postTextMinLength and postTextMaxLength constants', () {
      expect(postTextMinLength, 1);
      expect(postTextMaxLength, 5000);
    });
  });
}

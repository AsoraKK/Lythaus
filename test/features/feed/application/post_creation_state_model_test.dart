import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';

void main() {
  // ─── PostCreationState ───
  group('PostCreationState', () {
    test('default state has correct values', () {
      const s = PostCreationState();
      expect(s.text, '');
      expect(s.mediaUrl, isNull);
      expect(s.isSubmitting, isFalse);
      expect(s.result, isNull);
      expect(s.validationError, isNull);
      expect(s.isNews, isFalse);
      expect(s.contentType, 'text');
      expect(s.aiLabel, isNull);
      expect(s.proofSignals, isA<ProofSignals>());
    });

    test('isValid returns true for non-empty text within limit', () {
      const s = PostCreationState(text: 'Hello world', aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('isValid returns false for empty text', () {
      const s = PostCreationState(text: '');
      expect(s.isValid, isFalse);
    });

    test('isValid returns false for whitespace-only text', () {
      const s = PostCreationState(text: '   ');
      expect(s.isValid, isFalse);
    });

    test('isValid returns false when text exceeds 5000 chars', () {
      final longText = 'a' * 5001;
      final s = PostCreationState(text: longText);
      expect(s.isValid, isFalse);
    });

    test('isValid returns true when text is exactly 5000 chars', () {
      final exactText = 'a' * 5000;
      final s = PostCreationState(text: exactText, aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('isSuccess returns true for CreatePostSuccess', () {
      final s = PostCreationState(
        result: CreatePostSuccess(
          Post(
            id: 'p1',
            authorId: 'a1',
            authorUsername: 'user',
            text: 'hello',
            createdAt: DateTime(2024),
          ),
        ),
      );
      expect(s.isSuccess, isTrue);
      expect(s.isBlocked, isFalse);
      expect(s.isLimitExceeded, isFalse);
      expect(s.hasError, isFalse);
    });

    test('successResult returns CreatePostSuccess', () {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'user',
        text: 'hello',
        createdAt: DateTime(2024),
      );
      final s = PostCreationState(result: CreatePostSuccess(post));
      expect(s.successResult, isNotNull);
      expect(s.successResult!.post.id, 'p1');
    });

    test('successResult returns null for non-success', () {
      const s = PostCreationState();
      expect(s.successResult, isNull);
    });

    test('isBlocked returns true for CreatePostBlocked', () {
      const s = PostCreationState(
        result: CreatePostBlocked(
          message: 'blocked',
          categories: ['hate'],
          code: 'CONTENT_BLOCKED',
        ),
      );
      expect(s.isBlocked, isTrue);
      expect(s.isSuccess, isFalse);
    });

    test('blockedResult returns CreatePostBlocked', () {
      const s = PostCreationState(
        result: CreatePostBlocked(
          message: 'blocked',
          categories: ['spam'],
          code: 'BLOCKED',
        ),
      );
      expect(s.blockedResult, isNotNull);
      expect(s.blockedResult!.message, 'blocked');
    });

    test('blockedResult returns null for non-blocked', () {
      const s = PostCreationState();
      expect(s.blockedResult, isNull);
    });

    test('isLimitExceeded returns true for CreatePostLimitExceeded', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 1),
        ),
      );
      expect(s.isLimitExceeded, isTrue);
      expect(s.isSuccess, isFalse);
    });

    test('limitExceededResult returns CreatePostLimitExceeded', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit hit',
          limit: 5,
          currentCount: 5,
          tier: 'free',
          retryAfter: Duration(minutes: 30),
        ),
      );
      expect(s.limitExceededResult, isNotNull);
      expect(s.limitExceededResult!.limit, 5);
    });

    test('limitExceededResult returns null for non-limit', () {
      const s = PostCreationState();
      expect(s.limitExceededResult, isNull);
    });

    test('hasError returns true for CreatePostError', () {
      const s = PostCreationState(
        result: CreatePostError(message: 'something broke'),
      );
      expect(s.hasError, isTrue);
      expect(s.isSuccess, isFalse);
    });

    test('errorResult returns CreatePostError', () {
      const s = PostCreationState(
        result: CreatePostError(message: 'fail', code: 'ERR'),
      );
      expect(s.errorResult, isNotNull);
      expect(s.errorResult!.message, 'fail');
      expect(s.errorResult!.code, 'ERR');
    });

    test('errorResult returns null for non-error', () {
      const s = PostCreationState();
      expect(s.errorResult, isNull);
    });

    test('copyWith preserves existing values', () {
      final s = PostCreationState(
        text: 'hello',
        mediaUrl: 'http://img.png',
        isSubmitting: true,
        result: CreatePostSuccess(
          Post(
            id: 'p1',
            authorId: 'a1',
            authorUsername: 'user',
            text: 'hello',
            createdAt: DateTime(2024),
          ),
        ),
        validationError: 'err',
        isNews: true,
        contentType: 'image',
        aiLabel: 'assisted',
        proofSignals: const ProofSignals(captureMetadataHash: 'abc'),
      );

      final copy = s.copyWith();
      expect(copy.text, 'hello');
      expect(copy.mediaUrl, 'http://img.png');
      expect(copy.isSubmitting, isTrue);
      expect(copy.result, isNotNull);
      expect(copy.validationError, 'err');
      expect(copy.isNews, isTrue);
      expect(copy.contentType, 'image');
      expect(copy.aiLabel, 'assisted');
      expect(copy.proofSignals.captureMetadataHash, 'abc');
    });

    test('copyWith overrides fields', () {
      const s = PostCreationState(text: 'old');
      final copy = s.copyWith(text: 'new', isNews: true, contentType: 'video');
      expect(copy.text, 'new');
      expect(copy.isNews, isTrue);
      expect(copy.contentType, 'video');
    });

    test('copyWith clearMediaUrl removes mediaUrl', () {
      const s = PostCreationState(mediaUrl: 'http://img.png');
      final copy = s.copyWith(clearMediaUrl: true);
      expect(copy.mediaUrl, isNull);
    });

    test('copyWith clearResult removes result', () {
      final s = PostCreationState(
        result: CreatePostSuccess(
          Post(
            id: 'p1',
            authorId: 'a1',
            authorUsername: 'user',
            text: 'hello',
            createdAt: DateTime(2024),
          ),
        ),
      );
      final copy = s.copyWith(clearResult: true);
      expect(copy.result, isNull);
    });

    test('copyWith clearValidationError removes error', () {
      const s = PostCreationState(validationError: 'err');
      final copy = s.copyWith(clearValidationError: true);
      expect(copy.validationError, isNull);
    });
  });

  // ─── Constants ───
  group('Post creation constants', () {
    test('postTextMinLength is 1', () {
      expect(postTextMinLength, 1);
    });

    test('postTextMaxLength is 5000', () {
      expect(postTextMaxLength, 5000);
    });
  });
}

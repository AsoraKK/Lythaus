import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';

Post _testPost({String id = 'p1'}) => Post(
  id: id,
  authorId: 'author1',
  authorUsername: 'user1',
  text: 'Hello world',
  createdAt: DateTime(2024, 1, 1),
);

void main() {
  // ─── PostCreationState constructor & defaults ───
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
      expect(s.proofSignals, isNotNull);
    });

    test('custom values', () {
      const s = PostCreationState(
        text: 'hi',
        mediaUrl: 'http://img',
        isSubmitting: true,
        validationError: 'err',
        isNews: true,
        contentType: 'image',
        aiLabel: 'assisted',
        proofSignals: ProofSignals(captureMetadataHash: 'abc'),
      );
      expect(s.text, 'hi');
      expect(s.mediaUrl, 'http://img');
      expect(s.isSubmitting, isTrue);
      expect(s.validationError, 'err');
      expect(s.isNews, isTrue);
      expect(s.contentType, 'image');
      expect(s.aiLabel, 'assisted');
      expect(s.proofSignals.captureMetadataHash, 'abc');
    });
  });

  // ─── copyWith ───
  group('copyWith', () {
    test('overrides text', () {
      const s = PostCreationState();
      final s2 = s.copyWith(text: 'new');
      expect(s2.text, 'new');
    });

    test('clears mediaUrl', () {
      const s = PostCreationState(mediaUrl: 'url');
      final s2 = s.copyWith(clearMediaUrl: true);
      expect(s2.mediaUrl, isNull);
    });

    test('clears result', () {
      final s = PostCreationState(result: CreatePostSuccess(_testPost()));
      final s2 = s.copyWith(clearResult: true);
      expect(s2.result, isNull);
    });

    test('clears validationError', () {
      const s = PostCreationState(validationError: 'err');
      final s2 = s.copyWith(clearValidationError: true);
      expect(s2.validationError, isNull);
    });

    test('sets isSubmitting', () {
      const s = PostCreationState();
      final s2 = s.copyWith(isSubmitting: true);
      expect(s2.isSubmitting, isTrue);
    });

    test('sets isNews', () {
      const s = PostCreationState();
      final s2 = s.copyWith(isNews: true);
      expect(s2.isNews, isTrue);
    });

    test('sets contentType', () {
      const s = PostCreationState();
      final s2 = s.copyWith(contentType: 'video');
      expect(s2.contentType, 'video');
    });

    test('sets aiLabel', () {
      const s = PostCreationState();
      final s2 = s.copyWith(aiLabel: 'generated');
      expect(s2.aiLabel, 'generated');
    });

    test('sets proofSignals', () {
      const s = PostCreationState();
      final s2 = s.copyWith(
        proofSignals: const ProofSignals(editHistoryHash: 'x'),
      );
      expect(s2.proofSignals.editHistoryHash, 'x');
    });
  });

  // ─── isValid ───
  group('isValid', () {
    test('empty text is not valid', () {
      const s = PostCreationState(text: '');
      expect(s.isValid, isFalse);
    });

    test('whitespace-only text is not valid', () {
      const s = PostCreationState(text: '   ');
      expect(s.isValid, isFalse);
    });

    test('normal text is valid', () {
      const s = PostCreationState(text: 'hello', aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('text exceeding 5000 chars is not valid', () {
      final s = PostCreationState(text: 'a' * 5001);
      expect(s.isValid, isFalse);
    });

    test('text at exactly 5000 chars is valid', () {
      final s = PostCreationState(text: 'a' * 5000, aiLabel: 'human');
      expect(s.isValid, isTrue);
    });
  });

  // ─── result type getters ───
  group('result type getters', () {
    test('isSuccess true for CreatePostSuccess', () {
      final s = PostCreationState(result: CreatePostSuccess(_testPost()));
      expect(s.isSuccess, isTrue);
      expect(s.isBlocked, isFalse);
      expect(s.isLimitExceeded, isFalse);
      expect(s.hasError, isFalse);
    });

    test('isBlocked true for CreatePostBlocked', () {
      const s = PostCreationState(
        result: CreatePostBlocked(
          message: 'spam detected',
          categories: ['spam'],
        ),
      );
      expect(s.isBlocked, isTrue);
      expect(s.isSuccess, isFalse);
    });

    test('isLimitExceeded true for CreatePostLimitExceeded', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit reached',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 1),
        ),
      );
      expect(s.isLimitExceeded, isTrue);
      expect(s.isSuccess, isFalse);
    });

    test('hasError true for CreatePostError', () {
      const s = PostCreationState(result: CreatePostError(message: 'oops'));
      expect(s.hasError, isTrue);
      expect(s.isSuccess, isFalse);
    });
  });

  // ─── typed result accessors ───
  group('typed result accessors', () {
    test('successResult returns CreatePostSuccess', () {
      final s = PostCreationState(result: CreatePostSuccess(_testPost()));
      expect(s.successResult, isNotNull);
      expect(s.successResult!.post.id, 'p1');
    });

    test('successResult returns null for non-success', () {
      const s = PostCreationState(result: CreatePostError(message: 'err'));
      expect(s.successResult, isNull);
    });

    test('blockedResult returns CreatePostBlocked', () {
      const s = PostCreationState(
        result: CreatePostBlocked(
          message: 'blocked',
          categories: ['hate'],
          code: 'mod_block',
        ),
      );
      expect(s.blockedResult, isNotNull);
      expect(s.blockedResult!.message, 'blocked');
      expect(s.blockedResult!.categories, ['hate']);
      expect(s.blockedResult!.code, 'mod_block');
    });

    test('blockedResult returns null for non-blocked', () {
      const s = PostCreationState();
      expect(s.blockedResult, isNull);
    });

    test('limitExceededResult returns CreatePostLimitExceeded', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'limit',
          limit: 5,
          currentCount: 5,
          tier: 'free',
          retryAfter: Duration(minutes: 30),
        ),
      );
      expect(s.limitExceededResult, isNotNull);
      expect(s.limitExceededResult!.limit, 5);
      expect(s.limitExceededResult!.currentCount, 5);
      expect(s.limitExceededResult!.tier, 'free');
      expect(s.limitExceededResult!.retryAfter, const Duration(minutes: 30));
    });

    test('limitExceededResult returns null for non-limit', () {
      const s = PostCreationState();
      expect(s.limitExceededResult, isNull);
    });

    test('errorResult returns CreatePostError', () {
      const s = PostCreationState(
        result: CreatePostError(message: 'fail', code: 'server_error'),
      );
      expect(s.errorResult, isNotNull);
      expect(s.errorResult!.message, 'fail');
      expect(s.errorResult!.code, 'server_error');
    });

    test('errorResult returns null for non-error', () {
      final s = PostCreationState(result: CreatePostSuccess(_testPost()));
      expect(s.errorResult, isNull);
    });
  });

  // ─── CreatePostResult subclasses ───
  group('CreatePostResult subclasses', () {
    test('CreatePostSuccess holds post', () {
      final post = _testPost(id: 'x1');
      final r = CreatePostSuccess(post);
      expect(r.post.id, 'x1');
      expect(r.post.authorUsername, 'user1');
    });

    test('CreatePostBlocked default code', () {
      const r = CreatePostBlocked(
        message: 'bad content',
        categories: ['violence'],
      );
      expect(r.code, 'content_blocked');
    });

    test('CreatePostError with originalError', () {
      final err = Exception('boom');
      final r = CreatePostError(message: 'failed', originalError: err);
      expect(r.originalError, err);
    });
  });

  // ─── CreatePostRequest ───
  group('CreatePostRequest', () {
    test('toJson basic fields', () {
      const req = CreatePostRequest(text: 'Hello');
      final json = req.toJson();
      expect(json['body'], 'Hello');
      expect(json['declaredCreationMode'], 'human');
      expect(json['geoScope'], 'none');
    });

    test('toJson excludes deferred media', () {
      const req = CreatePostRequest(text: 'X', mediaUrl: 'http://img.png');
      final json = req.toJson();
      expect(json.containsKey('mediaUrls'), isFalse);
    });

    test('toJson excludes deferred proof signals', () {
      const req = CreatePostRequest(
        text: 'X',
        proofSignals: ProofSignals(captureMetadataHash: 'abc'),
      );
      final json = req.toJson();
      expect(json.containsKey('proofSignals'), isFalse);
    });

    test('toJson excludes deferred news flag', () {
      const req = CreatePostRequest(text: 'News', isNews: true);
      expect(req.toJson().containsKey('isNews'), isFalse);
    });
  });

  // ─── Constants ───
  group('constants', () {
    test('postTextMinLength is 1', () {
      expect(postTextMinLength, 1);
    });

    test('postTextMaxLength is 5000', () {
      expect(postTextMaxLength, 5000);
    });
  });
}

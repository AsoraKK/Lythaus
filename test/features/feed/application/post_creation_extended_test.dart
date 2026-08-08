// ignore_for_file: public_member_api_docs, avoid_redundant_argument_values

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';

void main() {
  // ── PostCreationState ─────────────────────────────────────────────────
  group('PostCreationState defaults', () {
    test('initial state has correct defaults', () {
      const s = PostCreationState();
      expect(s.text, '');
      expect(s.mediaUrl, isNull);
      expect(s.isSubmitting, isFalse);
      expect(s.result, isNull);
      expect(s.validationError, isNull);
      expect(s.isNews, isFalse);
      expect(s.contentType, 'text');
      expect(s.aiLabel, isNull);
    });
  });

  group('PostCreationState.isValid', () {
    test('empty text is invalid', () {
      const s = PostCreationState(text: '');
      expect(s.isValid, isFalse);
    });

    test('whitespace-only text is invalid', () {
      const s = PostCreationState(text: '   ');
      expect(s.isValid, isFalse);
    });

    test('normal text is valid', () {
      const s = PostCreationState(text: 'Hello world', aiLabel: 'human');
      expect(s.isValid, isTrue);
    });

    test('text over 5000 chars is invalid', () {
      final s = PostCreationState(text: 'a' * 5001);
      expect(s.isValid, isFalse);
    });

    test('text exactly 5000 chars is valid', () {
      final s = PostCreationState(text: 'a' * 5000, aiLabel: 'human');
      expect(s.isValid, isTrue);
    });
  });

  group('PostCreationState result getters', () {
    test('isSuccess for CreatePostSuccess', () {
      final s = PostCreationState(result: CreatePostSuccess(_dummyPost()));
      expect(s.isSuccess, isTrue);
      expect(s.isBlocked, isFalse);
      expect(s.isLimitExceeded, isFalse);
      expect(s.hasError, isFalse);
      expect(s.successResult, isNotNull);
      expect(s.blockedResult, isNull);
      expect(s.limitExceededResult, isNull);
      expect(s.errorResult, isNull);
    });

    test('isBlocked for CreatePostBlocked', () {
      const s = PostCreationState(
        result: CreatePostBlocked(message: 'Blocked', categories: ['hate']),
      );
      expect(s.isBlocked, isTrue);
      expect(s.isSuccess, isFalse);
      expect(s.blockedResult, isNotNull);
      expect(s.blockedResult!.message, 'Blocked');
      expect(s.blockedResult!.categories, ['hate']);
      expect(s.blockedResult!.code, 'content_blocked');
    });

    test('isLimitExceeded for CreatePostLimitExceeded', () {
      const s = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'Limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 1),
        ),
      );
      expect(s.isLimitExceeded, isTrue);
      expect(s.limitExceededResult, isNotNull);
      expect(s.limitExceededResult!.limit, 10);
      expect(s.limitExceededResult!.currentCount, 10);
      expect(s.limitExceededResult!.tier, 'free');
    });

    test('hasError for CreatePostError', () {
      const s = PostCreationState(
        result: CreatePostError(message: 'fail', code: 'ERR'),
      );
      expect(s.hasError, isTrue);
      expect(s.errorResult, isNotNull);
      expect(s.errorResult!.message, 'fail');
      expect(s.errorResult!.code, 'ERR');
    });

    test('null result returns false for all', () {
      const s = PostCreationState();
      expect(s.isSuccess, isFalse);
      expect(s.isBlocked, isFalse);
      expect(s.isLimitExceeded, isFalse);
      expect(s.hasError, isFalse);
    });
  });

  group('PostCreationState.copyWith', () {
    test('overrides text', () {
      const s = PostCreationState(text: 'old');
      final copy = s.copyWith(text: 'new');
      expect(copy.text, 'new');
    });

    test('overrides isSubmitting', () {
      const s = PostCreationState();
      final copy = s.copyWith(isSubmitting: true);
      expect(copy.isSubmitting, isTrue);
    });

    test('clearMediaUrl sets mediaUrl to null', () {
      const s = PostCreationState(mediaUrl: 'http://img');
      final copy = s.copyWith(clearMediaUrl: true);
      expect(copy.mediaUrl, isNull);
    });

    test('clearResult sets result to null', () {
      const s = PostCreationState(result: CreatePostError(message: 'x'));
      final copy = s.copyWith(clearResult: true);
      expect(copy.result, isNull);
    });

    test('clearValidationError sets validationError to null', () {
      const s = PostCreationState(validationError: 'err');
      final copy = s.copyWith(clearValidationError: true);
      expect(copy.validationError, isNull);
    });

    test('overrides isNews', () {
      const s = PostCreationState();
      final copy = s.copyWith(isNews: true);
      expect(copy.isNews, isTrue);
    });

    test('overrides contentType', () {
      const s = PostCreationState();
      final copy = s.copyWith(contentType: 'image');
      expect(copy.contentType, 'image');
    });

    test('overrides aiLabel', () {
      const s = PostCreationState();
      final copy = s.copyWith(aiLabel: 'generated');
      expect(copy.aiLabel, 'generated');
    });

    test('overrides proofSignals', () {
      const s = PostCreationState();
      final copy = s.copyWith(
        proofSignals: const ProofSignals(captureMetadataHash: 'hash'),
      );
      expect(copy.proofSignals.captureMetadataHash, 'hash');
    });

    test('preserves unchanged fields', () {
      const s = PostCreationState(text: 'txt', isNews: true, aiLabel: 'mixed');
      final copy = s.copyWith(text: 'new');
      expect(copy.isNews, isTrue);
      expect(copy.aiLabel, 'mixed');
    });
  });

  // ── ProofSignals ──────────────────────────────────────────────────────
  group('ProofSignals', () {
    test('hasAny false when all null', () {
      const p = ProofSignals();
      expect(p.hasAny, isFalse);
    });

    test('hasAny false when all empty', () {
      const p = ProofSignals(
        captureMetadataHash: '',
        editHistoryHash: '  ',
        sourceAttestationUrl: '',
      );
      expect(p.hasAny, isFalse);
    });

    test('hasAny true when captureMetadataHash set', () {
      const p = ProofSignals(captureMetadataHash: 'hash');
      expect(p.hasAny, isTrue);
    });

    test('hasAny true when editHistoryHash set', () {
      const p = ProofSignals(editHistoryHash: 'hash');
      expect(p.hasAny, isTrue);
    });

    test('hasAny true when sourceAttestationUrl set', () {
      const p = ProofSignals(sourceAttestationUrl: 'http://url');
      expect(p.hasAny, isTrue);
    });

    test('toJson includes only non-empty', () {
      const p = ProofSignals(
        captureMetadataHash: 'h1',
        editHistoryHash: '',
        sourceAttestationUrl: 'http://url',
      );
      final json = p.toJson();
      expect(json['captureMetadataHash'], 'h1');
      expect(json.containsKey('editHistoryHash'), isFalse);
      expect(json['sourceAttestationUrl'], 'http://url');
    });

    test('toJson trims values', () {
      const p = ProofSignals(captureMetadataHash: '  h1  ');
      expect(p.toJson()['captureMetadataHash'], 'h1');
    });
  });

  // ── CreatePostRequest ─────────────────────────────────────────────────
  group('CreatePostRequest', () {
    test('toJson includes required fields', () {
      const r = CreatePostRequest(text: 'Hello');
      final json = r.toJson();
      expect(json['body'], 'Hello');
      expect(json['declaredCreationMode'], 'human');
      expect(json['geoScope'], 'none');
    });

    test('toJson excludes deferred media', () {
      const r = CreatePostRequest(text: 'x', mediaUrl: 'http://img');
      final json = r.toJson();
      expect(json.containsKey('mediaUrls'), isFalse);
    });

    test('toJson excludes null mediaUrl', () {
      const r = CreatePostRequest(text: 'x');
      expect(r.toJson().containsKey('mediaUrls'), isFalse);
    });

    test('toJson excludes deferred proof signals', () {
      const r = CreatePostRequest(
        text: 'x',
        proofSignals: ProofSignals(captureMetadataHash: 'h'),
      );
      expect(r.toJson().containsKey('proofSignals'), isFalse);
    });

    test('toJson excludes empty proofSignals', () {
      const r = CreatePostRequest(text: 'x');
      expect(r.toJson().containsKey('proofSignals'), isFalse);
    });
  });

  // ── UpdatePostRequest ─────────────────────────────────────────────────
  group('UpdatePostRequest', () {
    test('isEmpty is true when all null', () {
      const u = UpdatePostRequest();
      expect(u.isEmpty, isTrue);
    });

    test('isEmpty is false when text is set', () {
      const u = UpdatePostRequest(text: 'new');
      expect(u.isEmpty, isFalse);
    });

    test('isEmpty is false when mediaUrl is set', () {
      const u = UpdatePostRequest(mediaUrl: 'url');
      expect(u.isEmpty, isFalse);
    });

    test('isEmpty is false when isNews is set', () {
      const u = UpdatePostRequest(isNews: true);
      expect(u.isEmpty, isFalse);
    });

    test('isEmpty is false when contentType is set', () {
      const u = UpdatePostRequest(contentType: 'image');
      expect(u.isEmpty, isFalse);
    });

    test('isEmpty is false when aiLabel is set', () {
      const u = UpdatePostRequest(aiLabel: 'mixed');
      expect(u.isEmpty, isFalse);
    });

    test('isEmpty is false when proofSignals is set', () {
      const u = UpdatePostRequest(proofSignals: ProofSignals());
      expect(u.isEmpty, isFalse);
    });

    test('toJson includes only non-null fields', () {
      const u = UpdatePostRequest(text: 'new', isNews: true);
      final json = u.toJson();
      expect(json['content'], 'new');
      expect(json['isNews'], isTrue);
      expect(json.containsKey('contentType'), isFalse);
      expect(json.containsKey('aiLabel'), isFalse);
    });

    test('toJson includes proofSignals when hasAny', () {
      const u = UpdatePostRequest(
        proofSignals: ProofSignals(editHistoryHash: 'h'),
      );
      expect(u.toJson().containsKey('proofSignals'), isTrue);
    });

    test('toJson excludes empty proofSignals', () {
      const u = UpdatePostRequest(proofSignals: ProofSignals());
      expect(u.toJson().containsKey('proofSignals'), isFalse);
    });
  });

  // ── PostException ─────────────────────────────────────────────────────
  group('PostException', () {
    test('toString includes message', () {
      const e = PostException('Not found', code: '404');
      expect(e.toString(), 'PostException: Not found');
      expect(e.code, '404');
    });

    test('stores original error', () {
      final orig = Exception('root');
      final e = PostException('fail', originalError: orig);
      expect(e.originalError, orig);
    });
  });

  // ── Constants ─────────────────────────────────────────────────────────
  group('Post creation constants', () {
    test('postTextMinLength is 1', () {
      expect(postTextMinLength, 1);
    });

    test('postTextMaxLength is 5000', () {
      expect(postTextMaxLength, 5000);
    });
  });
}

Post _dummyPost() {
  return Post(
    id: 'p1',
    text: 'Hello',
    authorId: 'a1',
    authorUsername: 'user',
    createdAt: DateTime(2025, 1, 1),
    updatedAt: DateTime(2025, 1, 1),
    isNews: false,
  );
}

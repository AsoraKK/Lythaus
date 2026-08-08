import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

void main() {
  group('UpdatePostRequest', () {
    test('isEmpty returns true when all fields null', () {
      const req = UpdatePostRequest();
      expect(req.isEmpty, isTrue);
    });

    test('isEmpty returns false when text set', () {
      const req = UpdatePostRequest(text: 'new text');
      expect(req.isEmpty, isFalse);
    });

    test('isEmpty returns false when mediaUrl set', () {
      const req = UpdatePostRequest(mediaUrl: 'url');
      expect(req.isEmpty, isFalse);
    });

    test('isEmpty returns false when isNews set', () {
      const req = UpdatePostRequest(isNews: true);
      expect(req.isEmpty, isFalse);
    });

    test('isEmpty returns false when contentType set', () {
      const req = UpdatePostRequest(contentType: 'image');
      expect(req.isEmpty, isFalse);
    });

    test('isEmpty returns false when aiLabel set', () {
      const req = UpdatePostRequest(aiLabel: 'human');
      expect(req.isEmpty, isFalse);
    });

    test('isEmpty returns false when proofSignals set', () {
      const req = UpdatePostRequest(proofSignals: ProofSignals());
      expect(req.isEmpty, isFalse);
    });

    test('toJson includes only non-null fields', () {
      const req = UpdatePostRequest(
        text: 'edited',
        isNews: true,
        aiLabel: 'human',
      );
      final json = req.toJson();
      expect(json['content'], 'edited');
      expect(json['isNews'], true);
      expect(json['aiLabel'], 'human');
      expect(json.containsKey('mediaUrls'), isFalse);
      expect(json.containsKey('contentType'), isFalse);
      expect(json.containsKey('proofSignals'), isFalse);
    });

    test('toJson wraps mediaUrl in list', () {
      const req = UpdatePostRequest(mediaUrl: 'img.png');
      final json = req.toJson();
      expect(json['mediaUrls'], ['img.png']);
    });

    test('toJson includes proofSignals when hasAny', () {
      const req = UpdatePostRequest(
        proofSignals: ProofSignals(captureMetadataHash: 'abc'),
      );
      final json = req.toJson();
      expect(json['proofSignals'], isA<Map<String, dynamic>>());
      expect(json['proofSignals']['captureMetadataHash'], 'abc');
    });

    test('toJson excludes proofSignals when empty', () {
      const req = UpdatePostRequest(proofSignals: ProofSignals());
      final json = req.toJson();
      expect(json.containsKey('proofSignals'), isFalse);
    });

    test('toJson returns empty map when all null', () {
      const req = UpdatePostRequest();
      expect(req.toJson(), isEmpty);
    });
  });

  group('ProofSignals', () {
    test('hasAny returns false for default constructor', () {
      const ps = ProofSignals();
      expect(ps.hasAny, isFalse);
    });

    test('hasAny returns false for whitespace-only values', () {
      const ps = ProofSignals(
        captureMetadataHash: '  ',
        editHistoryHash: '\t',
        sourceAttestationUrl: ' \n ',
      );
      expect(ps.hasAny, isFalse);
    });

    test('hasAny returns true when captureMetadataHash is non-empty', () {
      const ps = ProofSignals(captureMetadataHash: 'hash123');
      expect(ps.hasAny, isTrue);
    });

    test('hasAny returns true when editHistoryHash is non-empty', () {
      const ps = ProofSignals(editHistoryHash: 'edit456');
      expect(ps.hasAny, isTrue);
    });

    test('hasAny returns true when sourceAttestationUrl is non-empty', () {
      const ps = ProofSignals(sourceAttestationUrl: 'https://proof.com');
      expect(ps.hasAny, isTrue);
    });

    test('toJson only includes non-blank fields, trimmed', () {
      const ps = ProofSignals(
        captureMetadataHash: ' h1 ',
        editHistoryHash: '',
        sourceAttestationUrl: '  https://s.com ',
      );
      final json = ps.toJson();
      expect(json['captureMetadataHash'], 'h1');
      expect(json.containsKey('editHistoryHash'), isFalse);
      expect(json['sourceAttestationUrl'], 'https://s.com');
    });

    test('toJson returns empty map for default', () {
      const ps = ProofSignals();
      expect(ps.toJson(), isEmpty);
    });
  });

  group('CreatePostRequest', () {
    test('toJson with defaults', () {
      const req = CreatePostRequest(text: 'Hello world');
      final json = req.toJson();
      expect(json['body'], 'Hello world');
      expect(json['declaredCreationMode'], 'human');
      expect(json['geoScope'], 'none');
    });

    test('toJson excludes deferred media and proof fields', () {
      const req = CreatePostRequest(
        text: 'Post',
        mediaUrl: 'img.png',
        isNews: true,
        proofSignals: ProofSignals(captureMetadataHash: 'hash'),
      );
      final json = req.toJson();
      expect(json.containsKey('mediaUrls'), isFalse);
      expect(json.containsKey('isNews'), isFalse);
      expect(json.containsKey('proofSignals'), isFalse);
    });
  });

  group('CreatePostResult subtypes', () {
    test('CreatePostBlocked has correct defaults', () {
      const b = CreatePostBlocked(message: 'blocked', categories: ['hate']);
      expect(b.message, 'blocked');
      expect(b.categories, ['hate']);
      expect(b.code, 'content_blocked');
    });

    test('CreatePostLimitExceeded stores fields', () {
      const le = CreatePostLimitExceeded(
        message: 'too many',
        limit: 10,
        currentCount: 10,
        tier: 'free',
        retryAfter: Duration(hours: 24),
      );
      expect(le.limit, 10);
      expect(le.retryAfter.inHours, 24);
    });

    test('CreatePostError stores optional fields', () {
      const e = CreatePostError(
        message: 'fail',
        code: 'x',
        originalError: 'err',
      );
      expect(e.code, 'x');
      expect(e.originalError, 'err');
    });
  });

  group('PostException', () {
    test('toString includes message', () {
      const ex = PostException('not found', code: '404');
      expect(ex.toString(), 'PostException: not found');
      expect(ex.code, '404');
    });
  });
}

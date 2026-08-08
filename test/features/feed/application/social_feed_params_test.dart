import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';

void main() {
  // ─── LocalFeedParams ───
  group('LocalFeedParams', () {
    test('default values', () {
      const p = LocalFeedParams(location: 'NYC');
      expect(p.location, 'NYC');
      expect(p.radius, isNull);
      expect(p.page, 1);
      expect(p.pageSize, 20);
    });

    test('equality with same values', () {
      const a = LocalFeedParams(
        location: 'NYC',
        radius: 10.0,
        page: 2,
        pageSize: 50,
      );
      const b = LocalFeedParams(
        location: 'NYC',
        radius: 10.0,
        page: 2,
        pageSize: 50,
      );
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('inequality with different location', () {
      const a = LocalFeedParams(location: 'NYC');
      const b = LocalFeedParams(location: 'LA');
      expect(a, isNot(equals(b)));
    });

    test('inequality with different radius', () {
      const a = LocalFeedParams(location: 'NYC', radius: 10.0);
      const b = LocalFeedParams(location: 'NYC', radius: 20.0);
      expect(a, isNot(equals(b)));
    });

    test('inequality with different page', () {
      const a = LocalFeedParams(location: 'NYC', page: 1);
      const b = LocalFeedParams(location: 'NYC', page: 2);
      expect(a, isNot(equals(b)));
    });

    test('inequality with different pageSize', () {
      const a = LocalFeedParams(location: 'NYC', pageSize: 20);
      const b = LocalFeedParams(location: 'NYC', pageSize: 50);
      expect(a, isNot(equals(b)));
    });

    test('not equal to different type', () {
      const a = LocalFeedParams(location: 'NYC');
      expect(a, isNot(equals('NYC')));
    });

    test('identical returns true', () {
      const a = LocalFeedParams(location: 'NYC');
      expect(identical(a, a), isTrue);
    });
  });

  // ─── CommentsParams ───
  group('CommentsParams', () {
    test('default values', () {
      const p = CommentsParams(postId: 'p1');
      expect(p.postId, 'p1');
      expect(p.page, 1);
      expect(p.pageSize, 50);
    });

    test('equality with same values', () {
      const a = CommentsParams(postId: 'p1', page: 2, pageSize: 30);
      const b = CommentsParams(postId: 'p1', page: 2, pageSize: 30);
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('inequality with different postId', () {
      const a = CommentsParams(postId: 'p1');
      const b = CommentsParams(postId: 'p2');
      expect(a, isNot(equals(b)));
    });

    test('inequality with different page', () {
      const a = CommentsParams(postId: 'p1', page: 1);
      const b = CommentsParams(postId: 'p1', page: 2);
      expect(a, isNot(equals(b)));
    });

    test('inequality with different pageSize', () {
      const a = CommentsParams(postId: 'p1', pageSize: 50);
      const b = CommentsParams(postId: 'p1', pageSize: 100);
      expect(a, isNot(equals(b)));
    });

    test('not equal to different type', () {
      const a = CommentsParams(postId: 'p1');
      expect(a, isNot(equals('p1')));
    });

    test('identical returns true', () {
      const a = CommentsParams(postId: 'p1');
      expect(identical(a, a), isTrue);
    });
  });
}

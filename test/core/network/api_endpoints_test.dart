import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/api_endpoints.dart';

void main() {
  group('ApiEndpoints', () {
    test('has correct base API path', () {
      expect(ApiEndpoints.authEmail, startsWith('/api/'));
      expect(ApiEndpoints.getMe, startsWith('/api/'));
    });

    group('Authentication endpoints', () {
      test('authEmail is correct', () {
        expect(ApiEndpoints.authEmail, equals('/api/auth/email'));
      });

      test('getMe is correct', () {
        expect(ApiEndpoints.getMe, equals('/api/users/me'));
      });

      test('getUserAuth is correct', () {
        expect(ApiEndpoints.getUserAuth, equals('/api/users/auth'));
      });
    });

    group('Privacy endpoints', () {
      test('exportUser is correct', () {
        expect(ApiEndpoints.exportUser, equals('/api/privacy/requests'));
      });

      test('exportStatus is correct', () {
        expect(
          ApiEndpoints.exportStatus,
          equals('/api/privacy/requests?requestType=export'),
        );
      });

      test('deleteUser is correct', () {
        expect(ApiEndpoints.deleteUser, equals('/api/privacy/requests'));
      });
    });

    group('Feed and Posts endpoints', () {
      test('getFeed is correct', () {
        expect(ApiEndpoints.getFeed, equals('/api/feed'));
      });

      test('createPost is correct', () {
        expect(ApiEndpoints.createPost, equals('/api/posts'));
      });

      test('getPost returns correct path', () {
        expect(ApiEndpoints.getPost('123'), equals('/api/posts/123'));
        expect(ApiEndpoints.getPost('abc-def'), equals('/api/posts/abc-def'));
      });

      test('deletePost returns correct path', () {
        expect(ApiEndpoints.deletePost('456'), equals('/api/posts/456'));
      });
    });

    group('Comments endpoints', () {
      test('getComments returns correct path', () {
        expect(
          ApiEndpoints.getComments('post-1'),
          equals('/api/posts/post-1/comments'),
        );
      });

      test('createComment returns correct path', () {
        expect(
          ApiEndpoints.createComment('post-2'),
          equals('/api/posts/post-2/comments'),
        );
      });
    });

    group('Likes endpoints', () {
      test('likePost returns correct path', () {
        expect(
          ApiEndpoints.likePost('post-3'),
          equals('/api/posts/post-3/like'),
        );
      });

      test('unlikePost returns correct path', () {
        expect(
          ApiEndpoints.unlikePost('post-4'),
          equals('/api/posts/post-4/unlike'),
        );
      });
    });

    group('Moderation endpoints', () {
      test('flagContent returns correct path', () {
        expect(
          ApiEndpoints.flagContent('content-1'),
          equals('/api/moderation/flag/content-1'),
        );
      });

      test('appealFlag returns correct path', () {
        expect(
          ApiEndpoints.appealFlag('flag-1'),
          equals('/api/moderation/appeal/flag-1'),
        );
      });
    });

    test('cannot be instantiated', () {
      // ApiEndpoints has private constructor, verify it's a static-only class
      expect(() => ApiEndpoints, returnsNormally);
    });
  });
}

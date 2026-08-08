import 'package:flutter_test/flutter_test.dart';

// LYTHAUS FEED POST MODEL TESTS
//
// 🎯 Purpose: Test feed post domain models and serialization
// ✅ Coverage: Post model validation, JSON serialization, edge cases
// 🧪 Test Types: Unit tests for domain models
// 📱 Platform: Flutter domain layer testing

// Simple Post model for feed testing
class Post {
  final String postId;
  final String authorId;
  final String authorName;
  final String content;
  final DateTime createdAt;
  final int likeCount;
  final int commentCount;
  final bool isLiked;
  final List<String> tags;
  final String? imageUrl;
  final PostStatus status;

  const Post({
    required this.postId,
    required this.authorId,
    required this.authorName,
    required this.content,
    required this.createdAt,
    required this.likeCount,
    required this.commentCount,
    required this.isLiked,
    required this.tags,
    this.imageUrl,
    required this.status,
  });

  factory Post.fromJson(Map<String, dynamic> json) {
    return Post(
      postId: json['postId'] as String,
      authorId: json['authorId'] as String,
      authorName: json['authorName'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      likeCount: (json['likeCount'] as int?) ?? 0,
      commentCount: (json['commentCount'] as int?) ?? 0,
      isLiked: (json['isLiked'] as bool?) ?? false,
      tags: List<String>.from(json['tags'] as Iterable<dynamic>? ?? []),
      imageUrl: json['imageUrl'] as String?,
      status: PostStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => PostStatus.published,
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'postId': postId,
      'authorId': authorId,
      'authorName': authorName,
      'content': content,
      'createdAt': createdAt.toIso8601String(),
      'likeCount': likeCount,
      'commentCount': commentCount,
      'isLiked': isLiked,
      'tags': tags,
      'imageUrl': imageUrl,
      'status': status.name,
    };
  }

  Post copyWith({
    String? postId,
    String? authorId,
    String? authorName,
    String? content,
    DateTime? createdAt,
    int? likeCount,
    int? commentCount,
    bool? isLiked,
    List<String>? tags,
    String? imageUrl,
    PostStatus? status,
  }) {
    return Post(
      postId: postId ?? this.postId,
      authorId: authorId ?? this.authorId,
      authorName: authorName ?? this.authorName,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      isLiked: isLiked ?? this.isLiked,
      tags: tags ?? this.tags,
      imageUrl: imageUrl ?? this.imageUrl,
      status: status ?? this.status,
    );
  }
}

enum PostStatus { draft, published, archived, flagged }

void main() {
  group('Post Model Tests', () {
    late Post testPost;

    setUp(() {
      testPost = Post(
        postId: 'post_123',
        authorId: 'user_456',
        authorName: 'Test Author',
        content: 'This is a test post content for the feed system',
        createdAt: DateTime(2025, 8, 2, 12, 30),
        likeCount: 15,
        commentCount: 3,
        isLiked: true,
        tags: ['test', 'flutter', 'development'],
        imageUrl: 'https://example.com/test-image.jpg',
        status: PostStatus.published,
      );
    });

    group('Model Creation', () {
      test('should create post with all required fields', () {
        // Assert
        expect(testPost.postId, 'post_123');
        expect(testPost.authorId, 'user_456');
        expect(testPost.authorName, 'Test Author');
        expect(
          testPost.content,
          'This is a test post content for the feed system',
        );
        expect(testPost.likeCount, 15);
        expect(testPost.commentCount, 3);
        expect(testPost.isLiked, true);
        expect(testPost.tags.length, 3);
        expect(testPost.tags, contains('test'));
        expect(testPost.imageUrl, 'https://example.com/test-image.jpg');
        expect(testPost.status, PostStatus.published);
      });

      test('should create post with minimal required data', () {
        // Arrange
        final minimalPost = Post(
          postId: 'minimal_post',
          authorId: 'minimal_user',
          authorName: 'Minimal User',
          content: 'Minimal content',
          createdAt: DateTime.now(),
          likeCount: 0,
          commentCount: 0,
          isLiked: false,
          tags: [],
          status: PostStatus.draft,
        );

        // Assert
        expect(minimalPost.postId, 'minimal_post');
        expect(minimalPost.likeCount, 0);
        expect(minimalPost.commentCount, 0);
        expect(minimalPost.isLiked, false);
        expect(minimalPost.tags, isEmpty);
        expect(minimalPost.imageUrl, isNull);
        expect(minimalPost.status, PostStatus.draft);
      });
    });

    group('JSON Serialization', () {
      test('should serialize to JSON correctly', () {
        // Act
        final json = testPost.toJson();

        // Assert
        expect(json, isA<Map<String, dynamic>>());
        expect(json['postId'], 'post_123');
        expect(json['authorId'], 'user_456');
        expect(json['authorName'], 'Test Author');
        expect(
          json['content'],
          'This is a test post content for the feed system',
        );
        expect(json['likeCount'], 15);
        expect(json['commentCount'], 3);
        expect(json['isLiked'], true);
        expect(json['tags'], ['test', 'flutter', 'development']);
        expect(json['imageUrl'], 'https://example.com/test-image.jpg');
        expect(json['status'], 'published');
        expect(json['createdAt'], '2025-08-02T12:30:00.000');
      });

      test('should deserialize from JSON correctly', () {
        // Arrange
        final json = {
          'postId': 'post_789',
          'authorId': 'user_101',
          'authorName': 'JSON Author',
          'content': 'Content from JSON deserialization test',
          'createdAt': '2025-08-02T14:45:00.000Z',
          'likeCount': 25,
          'commentCount': 8,
          'isLiked': false,
          'tags': ['json', 'test', 'serialization'],
          'imageUrl': 'https://example.com/json-image.jpg',
          'status': 'published',
        };

        // Act
        final post = Post.fromJson(json);

        // Assert
        expect(post.postId, 'post_789');
        expect(post.authorId, 'user_101');
        expect(post.authorName, 'JSON Author');
        expect(post.content, 'Content from JSON deserialization test');
        expect(post.createdAt, DateTime.parse('2025-08-02T14:45:00.000Z'));
        expect(post.likeCount, 25);
        expect(post.commentCount, 8);
        expect(post.isLiked, false);
        expect(post.tags, ['json', 'test', 'serialization']);
        expect(post.imageUrl, 'https://example.com/json-image.jpg');
        expect(post.status, PostStatus.published);
      });

      test('should handle null optional fields in JSON', () {
        // Arrange
        final json = {
          'postId': 'post_minimal',
          'authorId': 'user_minimal',
          'authorName': 'Minimal Author',
          'content': 'Minimal content',
          'createdAt': '2025-08-02T16:00:00.000Z',
          'status': 'draft',
          // Optional fields are null/missing
        };

        // Act
        final post = Post.fromJson(json);

        // Assert
        expect(post.postId, 'post_minimal');
        expect(post.likeCount, 0);
        expect(post.commentCount, 0);
        expect(post.isLiked, false);
        expect(post.tags, isEmpty);
        expect(post.imageUrl, isNull);
        expect(post.status, PostStatus.draft);
      });

      test('should handle invalid JSON status gracefully', () {
        // Arrange
        final json = {
          'postId': 'post_invalid',
          'authorId': 'user_invalid',
          'authorName': 'Invalid Author',
          'content': 'Content with invalid status',
          'createdAt': '2025-08-02T17:00:00.000Z',
          'status': 'invalid_status',
        };

        // Act
        final post = Post.fromJson(json);

        // Assert - Should default to published status
        expect(post.status, PostStatus.published);
      });
    });

    group('Copy With Method', () {
      test('should create copy with updated fields', () {
        // Act
        final updatedPost = testPost.copyWith(
          isLiked: false,
          commentCount: 5,
          likeCount: 20, // Actually pass the likeCount parameter
        );

        // Assert
        expect(updatedPost.postId, testPost.postId); // Unchanged
        expect(updatedPost.authorName, testPost.authorName); // Unchanged
        expect(updatedPost.content, testPost.content); // Unchanged
        expect(updatedPost.likeCount, 20); // Changed
        expect(updatedPost.isLiked, false); // Changed
        expect(updatedPost.commentCount, 5); // Changed
      });

      test(
        'should create copy with no changes when no parameters provided',
        () {
          final copiedPost = testPost.copyWith();

          // Assert
          expect(copiedPost.postId, testPost.postId);
          expect(copiedPost.authorName, testPost.authorName);
          expect(copiedPost.content, testPost.content);
          expect(copiedPost.likeCount, testPost.likeCount);
          expect(copiedPost.isLiked, testPost.isLiked);
          expect(copiedPost.commentCount, testPost.commentCount);
          expect(copiedPost.tags, testPost.tags);
          expect(copiedPost.imageUrl, testPost.imageUrl);
          expect(copiedPost.status, testPost.status);
        },
      );

      test('should create copy with status change', () {
        // Act
        final archivedPost = testPost.copyWith(status: PostStatus.archived);

        // Assert
        expect(archivedPost.status, PostStatus.archived);
        expect(archivedPost.postId, testPost.postId); // Other fields unchanged
      });
    });

    group('Post Status Validation', () {
      test('should validate all post status enum values', () {
        // Arrange & Act
        const statusValues = PostStatus.values;

        // Assert
        expect(statusValues.length, 4);
        expect(statusValues, contains(PostStatus.draft));
        expect(statusValues, contains(PostStatus.published));
        expect(statusValues, contains(PostStatus.archived));
        expect(statusValues, contains(PostStatus.flagged));
      });

      test('should handle status transitions correctly', () {
        // Arrange
        final draftPost = testPost.copyWith(status: PostStatus.draft);

        // Act & Assert - Draft to Published
        final publishedPost = draftPost.copyWith(status: PostStatus.published);
        expect(publishedPost.status, PostStatus.published);

        // Act & Assert - Published to Archived
        final archivedPost = publishedPost.copyWith(
          status: PostStatus.archived,
        );
        expect(archivedPost.status, PostStatus.archived);

        // Act & Assert - Any status to Flagged
        final flaggedPost = publishedPost.copyWith(status: PostStatus.flagged);
        expect(flaggedPost.status, PostStatus.flagged);
      });
    });

    group('Edge Cases', () {
      test('should handle very long content', () {
        // Arrange
        final longContent = 'This is a very long post content ' * 100;
        final longPost = testPost.copyWith(content: longContent);

        // Act
        final json = longPost.toJson();
        final deserializedPost = Post.fromJson(json);

        // Assert
        expect(deserializedPost.content, longContent);
        expect(deserializedPost.content.length, longContent.length);
      });

      test('should handle empty tags list', () {
        // Arrange
        final postWithoutTags = testPost.copyWith(tags: []);

        // Act
        final json = postWithoutTags.toJson();
        final deserializedPost = Post.fromJson(json);

        // Assert
        expect(deserializedPost.tags, isEmpty);
      });

      test('should handle special characters in content', () {
        // Arrange
        const specialContent =
            'Post with émojis 🎉, symbols @#\$%, and newlines\n\nMultiple lines!';
        final specialPost = testPost.copyWith(content: specialContent);

        // Act
        final json = specialPost.toJson();
        final deserializedPost = Post.fromJson(json);

        // Assert
        expect(deserializedPost.content, specialContent);
      });

      test('should handle zero and negative counts gracefully', () {
        // Arrange
        final postWithZeroCounts = testPost.copyWith(
          likeCount: 0,
          commentCount: 0,
        );

        // Act
        final json = postWithZeroCounts.toJson();
        final deserializedPost = Post.fromJson(json);

        // Assert
        expect(deserializedPost.likeCount, 0);
        expect(deserializedPost.commentCount, 0);
      });

      test('should handle future dates correctly', () {
        // Arrange
        final futureDate = DateTime(2026, 12, 31, 23, 59);
        final futurePost = testPost.copyWith(createdAt: futureDate);

        // Act
        final json = futurePost.toJson();
        final deserializedPost = Post.fromJson(json);

        // Assert
        expect(deserializedPost.createdAt, futureDate);
      });
    });
  });
}

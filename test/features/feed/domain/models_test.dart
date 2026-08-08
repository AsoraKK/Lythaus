import 'package:lythaus/features/feed/domain/models.dart';
import 'package:flutter_test/flutter_test.dart';

// LYTHAUS FEED DOMAIN MODELS TESTS
//
// 🎯 Purpose: Comprehensive test coverage for feed domain models
// ✅ Coverage: All classes, constructors, JSON serialization, enums, extensions
// 🧪 Test Types: Unit tests for domain models and serialization
// 📱 Platform: Flutter domain layer testing

void main() {
  group('Post Model', () {
    final testDate = DateTime.parse('2023-01-01T12:00:00Z');
    final testUpdatedDate = DateTime.parse('2023-01-02T12:00:00Z');

    test('constructor with required parameters', () {
      final post = Post(
        id: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Hello world',
        createdAt: testDate,
      );

      expect(post.id, 'post1');
      expect(post.authorId, 'user1');
      expect(post.authorUsername, 'testuser');
      expect(post.text, 'Hello world');
      expect(post.createdAt, testDate);
      expect(post.updatedAt, isNull);
      expect(post.likeCount, 0);
      expect(post.dislikeCount, 0);
      expect(post.commentCount, 0);
      expect(post.mediaUrls, isNull);
      expect(post.moderation, isNull);
      expect(post.metadata, isNull);
      expect(post.userLiked, false);
      expect(post.userDisliked, false);
    });

    test('constructor with all parameters', () {
      final moderation = PostModerationData(
        confidence: 'high',
        score: 0.95,
        flags: ['spam'],
        analyzedAt: testDate,
        provider: 'lythaus_authenticity_ai',
      );

      const metadata = PostMetadata(
        location: 'New York',
        tags: ['flutter', 'dart'],
        isPinned: true,
        isEdited: true,
        category: 'tech',
      );

      final post = Post(
        id: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Hello world',
        createdAt: testDate,
        updatedAt: testUpdatedDate,
        likeCount: 10,
        dislikeCount: 2,
        commentCount: 5,
        mediaUrls: ['image1.jpg', 'image2.jpg'],
        moderation: moderation,
        metadata: metadata,
        userLiked: true,
        userDisliked: false,
      );

      expect(post.id, 'post1');
      expect(post.updatedAt, testUpdatedDate);
      expect(post.likeCount, 10);
      expect(post.dislikeCount, 2);
      expect(post.commentCount, 5);
      expect(post.mediaUrls, ['image1.jpg', 'image2.jpg']);
      expect(post.moderation, moderation);
      expect(post.metadata, metadata);
      expect(post.userLiked, true);
      expect(post.userDisliked, false);
    });

    test('fromJson with minimal data', () {
      final json = {
        'id': 'post1',
        'authorId': 'user1',
        'authorUsername': 'testuser',
        'text': 'Hello world',
        'createdAt': '2023-01-01T12:00:00.000Z',
      };

      final post = Post.fromJson(json);

      expect(post.id, 'post1');
      expect(post.authorId, 'user1');
      expect(post.authorUsername, 'testuser');
      expect(post.text, 'Hello world');
      expect(post.createdAt, testDate);
      expect(post.updatedAt, isNull);
      expect(post.likeCount, 0);
      expect(post.dislikeCount, 0);
      expect(post.commentCount, 0);
      expect(post.mediaUrls, isNull);
      expect(post.moderation, isNull);
      expect(post.metadata, isNull);
      expect(post.userLiked, false);
      expect(post.userDisliked, false);
    });

    test('fromJson with all data', () {
      final json = {
        'id': 'post1',
        'authorId': 'user1',
        'authorUsername': 'testuser',
        'text': 'Hello world',
        'createdAt': '2023-01-01T12:00:00.000Z',
        'updatedAt': '2023-01-02T12:00:00.000Z',
        'likeCount': 10,
        'dislikeCount': 2,
        'commentCount': 5,
        'mediaUrls': ['image1.jpg', 'image2.jpg'],
        'moderation': {
          'confidence': 'high',
          'score': 0.95,
          'flags': ['spam'],
          'analyzedAt': '2023-01-01T12:00:00.000Z',
          'provider': 'lythaus_authenticity_ai',
        },
        'metadata': {
          'location': 'New York',
          'tags': ['flutter', 'dart'],
          'isPinned': true,
          'isEdited': true,
          'category': 'tech',
        },
        'userLiked': true,
        'userDisliked': false,
      };

      final post = Post.fromJson(json);

      expect(post.id, 'post1');
      expect(post.updatedAt, testUpdatedDate);
      expect(post.likeCount, 10);
      expect(post.dislikeCount, 2);
      expect(post.commentCount, 5);
      expect(post.mediaUrls, ['image1.jpg', 'image2.jpg']);
      expect(post.moderation!.confidence, 'high');
      expect(post.moderation!.score, 0.95);
      expect(post.metadata!.location, 'New York');
      expect(post.metadata!.tags, ['flutter', 'dart']);
      expect(post.metadata!.isPinned, true);
      expect(post.metadata!.isEdited, true);
      expect(post.metadata!.category, 'tech');
      expect(post.userLiked, true);
      expect(post.userDisliked, false);
    });

    test('fromJson with enriched view data', () {
      final json = {
        'id': 'post2',
        'authorId': 'user2',
        'author': {'displayName': 'Anna Reader', 'username': 'annareader'},
        'content': 'Hello from content field',
        'createdAt': '2023-01-01T12:00:00.000Z',
        'topics': ['policy', 'safety'],
        'location': 'Global',
        'category': 'analysis',
        'viewerHasLiked': true,
      };

      final post = Post.fromJson(json);

      expect(post.authorUsername, 'annareader');
      expect(post.text, 'Hello from content field');
      expect(post.metadata?.tags, ['policy', 'safety']);
      expect(post.metadata?.location, 'Global');
      expect(post.metadata?.category, 'analysis');
      expect(post.userLiked, true);
    });

    test('toJson with minimal data', () {
      final post = Post(
        id: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Hello world',
        createdAt: testDate,
      );

      final json = post.toJson();

      expect(json['id'], 'post1');
      expect(json['authorId'], 'user1');
      expect(json['authorUsername'], 'testuser');
      expect(json['text'], 'Hello world');
      expect(json['createdAt'], '2023-01-01T12:00:00.000Z');
      expect(json.containsKey('updatedAt'), false);
      expect(json['likeCount'], 0);
      expect(json['dislikeCount'], 0);
      expect(json['commentCount'], 0);
      expect(json.containsKey('mediaUrls'), false);
      expect(json.containsKey('moderation'), false);
      expect(json.containsKey('metadata'), false);
      expect(json['userLiked'], false);
      expect(json['userDisliked'], false);
    });

    test('toJson with all data', () {
      final moderation = PostModerationData(
        confidence: 'high',
        score: 0.95,
        flags: ['spam'],
        analyzedAt: testDate,
        provider: 'lythaus_authenticity_ai',
      );

      const metadata = PostMetadata(
        location: 'New York',
        tags: ['flutter', 'dart'],
        isPinned: true,
        isEdited: true,
        category: 'tech',
      );

      final post = Post(
        id: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Hello world',
        createdAt: testDate,
        updatedAt: testUpdatedDate,
        likeCount: 10,
        dislikeCount: 2,
        commentCount: 5,
        mediaUrls: ['image1.jpg', 'image2.jpg'],
        moderation: moderation,
        metadata: metadata,
        userLiked: true,
        userDisliked: false,
      );

      final json = post.toJson();

      expect(json['updatedAt'], '2023-01-02T12:00:00.000Z');
      expect(json['likeCount'], 10);
      expect(json['dislikeCount'], 2);
      expect(json['commentCount'], 5);
      expect(json['mediaUrls'], ['image1.jpg', 'image2.jpg']);
      expect(json['moderation']['confidence'], 'high');
      expect(json['moderation']['score'], 0.95);
      expect(json['metadata']['location'], 'New York');
      expect(json['metadata']['tags'], ['flutter', 'dart']);
      expect(json['metadata']['isPinned'], true);
      expect(json['metadata']['isEdited'], true);
      expect(json['metadata']['category'], 'tech');
      expect(json['userLiked'], true);
      expect(json['userDisliked'], false);
    });
  });

  group('PostModerationData Model', () {
    final testDate = DateTime.parse('2023-01-01T12:00:00Z');

    test('constructor', () {
      final moderation = PostModerationData(
        confidence: 'high',
        score: 0.95,
        flags: ['spam', 'hate'],
        analyzedAt: testDate,
        provider: 'lythaus_authenticity_ai',
      );

      expect(moderation.confidence, 'high');
      expect(moderation.score, 0.95);
      expect(moderation.flags, ['spam', 'hate']);
      expect(moderation.analyzedAt, testDate);
      expect(moderation.provider, 'lythaus_authenticity_ai');
    });

    test('fromJson', () {
      final json = {
        'confidence': 'high',
        'score': 0.95,
        'flags': ['spam', 'hate'],
        'analyzedAt': '2023-01-01T12:00:00.000Z',
        'provider': 'lythaus_authenticity_ai',
      };

      final moderation = PostModerationData.fromJson(json);

      expect(moderation.confidence, 'high');
      expect(moderation.score, 0.95);
      expect(moderation.flags, ['spam', 'hate']);
      expect(moderation.analyzedAt, testDate);
      expect(moderation.provider, 'lythaus_authenticity_ai');
    });

    test('fromJson with empty flags', () {
      final json = {
        'confidence': 'low',
        'score': 0.3,
        'analyzedAt': '2023-01-01T12:00:00.000Z',
        'provider': 'openai',
      };

      final moderation = PostModerationData.fromJson(json);

      expect(moderation.confidence, 'low');
      expect(moderation.score, 0.3);
      expect(moderation.flags, <String>[]);
      expect(moderation.analyzedAt, testDate);
      expect(moderation.provider, 'openai');
    });

    test('toJson', () {
      final moderation = PostModerationData(
        confidence: 'high',
        score: 0.95,
        flags: ['spam', 'hate'],
        analyzedAt: testDate,
        provider: 'lythaus_authenticity_ai',
      );

      final json = moderation.toJson();

      expect(json['confidence'], 'high');
      expect(json['score'], 0.95);
      expect(json['flags'], ['spam', 'hate']);
      expect(json['analyzedAt'], '2023-01-01T12:00:00.000Z');
      expect(json['provider'], 'lythaus_authenticity_ai');
    });
  });

  group('PostMetadata Model', () {
    test('constructor with defaults', () {
      const metadata = PostMetadata();

      expect(metadata.location, isNull);
      expect(metadata.tags, isNull);
      expect(metadata.isPinned, false);
      expect(metadata.isEdited, false);
      expect(metadata.category, isNull);
    });

    test('constructor with all parameters', () {
      const metadata = PostMetadata(
        location: 'New York',
        tags: ['flutter', 'dart'],
        isPinned: true,
        isEdited: true,
        category: 'tech',
      );

      expect(metadata.location, 'New York');
      expect(metadata.tags, ['flutter', 'dart']);
      expect(metadata.isPinned, true);
      expect(metadata.isEdited, true);
      expect(metadata.category, 'tech');
    });

    test('fromJson with minimal data', () {
      final json = <String, dynamic>{};

      final metadata = PostMetadata.fromJson(json);

      expect(metadata.location, isNull);
      expect(metadata.tags, isNull);
      expect(metadata.isPinned, false);
      expect(metadata.isEdited, false);
      expect(metadata.category, isNull);
    });

    test('fromJson with all data', () {
      final json = {
        'location': 'New York',
        'tags': ['flutter', 'dart'],
        'isPinned': true,
        'isEdited': true,
        'category': 'tech',
      };

      final metadata = PostMetadata.fromJson(json);

      expect(metadata.location, 'New York');
      expect(metadata.tags, ['flutter', 'dart']);
      expect(metadata.isPinned, true);
      expect(metadata.isEdited, true);
      expect(metadata.category, 'tech');
    });

    test('toJson with minimal data', () {
      const metadata = PostMetadata();

      final json = metadata.toJson();

      expect(json.containsKey('location'), false);
      expect(json.containsKey('tags'), false);
      expect(json['isPinned'], false);
      expect(json['isEdited'], false);
      expect(json.containsKey('category'), false);
    });

    test('toJson with all data', () {
      const metadata = PostMetadata(
        location: 'New York',
        tags: ['flutter', 'dart'],
        isPinned: true,
        isEdited: true,
        category: 'tech',
      );

      final json = metadata.toJson();

      expect(json['location'], 'New York');
      expect(json['tags'], ['flutter', 'dart']);
      expect(json['isPinned'], true);
      expect(json['isEdited'], true);
      expect(json['category'], 'tech');
    });
  });

  group('Comment Model', () {
    final testDate = DateTime.parse('2023-01-01T12:00:00Z');

    test('constructor with required parameters', () {
      final comment = Comment(
        id: 'comment1',
        postId: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Great post!',
        createdAt: testDate,
      );

      expect(comment.id, 'comment1');
      expect(comment.postId, 'post1');
      expect(comment.authorId, 'user1');
      expect(comment.authorUsername, 'testuser');
      expect(comment.text, 'Great post!');
      expect(comment.createdAt, testDate);
      expect(comment.likeCount, 0);
      expect(comment.dislikeCount, 0);
      expect(comment.parentCommentId, isNull);
    });

    test('constructor with all parameters', () {
      final comment = Comment(
        id: 'comment1',
        postId: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Great post!',
        createdAt: testDate,
        likeCount: 5,
        dislikeCount: 1,
        parentCommentId: 'parent1',
      );

      expect(comment.likeCount, 5);
      expect(comment.dislikeCount, 1);
      expect(comment.parentCommentId, 'parent1');
    });

    test('fromJson with minimal data', () {
      final json = {
        'id': 'comment1',
        'postId': 'post1',
        'authorId': 'user1',
        'authorUsername': 'testuser',
        'text': 'Great post!',
        'createdAt': '2023-01-01T12:00:00.000Z',
      };

      final comment = Comment.fromJson(json);

      expect(comment.id, 'comment1');
      expect(comment.postId, 'post1');
      expect(comment.authorId, 'user1');
      expect(comment.authorUsername, 'testuser');
      expect(comment.text, 'Great post!');
      expect(comment.createdAt, testDate);
      expect(comment.likeCount, 0);
      expect(comment.dislikeCount, 0);
      expect(comment.parentCommentId, isNull);
    });

    test('fromJson with all data', () {
      final json = {
        'id': 'comment1',
        'postId': 'post1',
        'authorId': 'user1',
        'authorUsername': 'testuser',
        'text': 'Great post!',
        'createdAt': '2023-01-01T12:00:00.000Z',
        'likeCount': 5,
        'dislikeCount': 1,
        'parentCommentId': 'parent1',
      };

      final comment = Comment.fromJson(json);

      expect(comment.likeCount, 5);
      expect(comment.dislikeCount, 1);
      expect(comment.parentCommentId, 'parent1');
    });

    test('toJson with minimal data', () {
      final comment = Comment(
        id: 'comment1',
        postId: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Great post!',
        createdAt: testDate,
      );

      final json = comment.toJson();

      expect(json['id'], 'comment1');
      expect(json['postId'], 'post1');
      expect(json['authorId'], 'user1');
      expect(json['authorUsername'], 'testuser');
      expect(json['text'], 'Great post!');
      expect(json['createdAt'], '2023-01-01T12:00:00.000Z');
      expect(json['likeCount'], 0);
      expect(json['dislikeCount'], 0);
      expect(json.containsKey('parentCommentId'), false);
    });

    test('toJson with all data', () {
      final comment = Comment(
        id: 'comment1',
        postId: 'post1',
        authorId: 'user1',
        authorUsername: 'testuser',
        text: 'Great post!',
        createdAt: testDate,
        likeCount: 5,
        dislikeCount: 1,
        parentCommentId: 'parent1',
      );

      final json = comment.toJson();

      expect(json['likeCount'], 5);
      expect(json['dislikeCount'], 1);
      expect(json['parentCommentId'], 'parent1');
    });
  });

  group('FeedResponse Model', () {
    final testDate = DateTime.parse('2023-01-01T12:00:00Z');

    test('constructor with required parameters', () {
      final posts = [
        Post(
          id: 'post1',
          authorId: 'user1',
          authorUsername: 'testuser',
          text: 'Hello world',
          createdAt: testDate,
        ),
      ];

      final response = FeedResponse(
        posts: posts,
        totalCount: 1,
        hasMore: false,
        page: 1,
        pageSize: 20,
      );

      expect(response.posts, posts);
      expect(response.totalCount, 1);
      expect(response.hasMore, false);
      expect(response.nextCursor, isNull);
      expect(response.page, 1);
      expect(response.pageSize, 20);
    });

    test('constructor with all parameters', () {
      final posts = [
        Post(
          id: 'post1',
          authorId: 'user1',
          authorUsername: 'testuser',
          text: 'Hello world',
          createdAt: testDate,
        ),
      ];

      final response = FeedResponse(
        posts: posts,
        totalCount: 50,
        hasMore: true,
        nextCursor: 'cursor123',
        page: 2,
        pageSize: 10,
      );

      expect(response.posts, posts);
      expect(response.totalCount, 50);
      expect(response.hasMore, true);
      expect(response.nextCursor, 'cursor123');
      expect(response.page, 2);
      expect(response.pageSize, 10);
    });

    test('fromJson', () {
      final json = {
        'posts': [
          {
            'id': 'post1',
            'authorId': 'user1',
            'authorUsername': 'testuser',
            'text': 'Hello world',
            'createdAt': '2023-01-01T12:00:00.000Z',
          },
        ],
        'totalCount': 50,
        'hasMore': true,
        'nextCursor': 'cursor123',
        'page': 2,
        'pageSize': 10,
      };

      final response = FeedResponse.fromJson(json);

      expect(response.posts.length, 1);
      expect(response.posts[0].id, 'post1');
      expect(response.totalCount, 50);
      expect(response.hasMore, true);
      expect(response.nextCursor, 'cursor123');
      expect(response.page, 2);
      expect(response.pageSize, 10);
    });

    test('fromJson with defaults', () {
      final json = {
        'posts': [
          {
            'id': 'post1',
            'authorId': 'user1',
            'authorUsername': 'testuser',
            'text': 'Hello world',
            'createdAt': '2023-01-01T12:00:00.000Z',
          },
        ],
        'totalCount': 1,
        'hasMore': false,
      };

      final response = FeedResponse.fromJson(json);

      expect(response.page, 1);
      expect(response.pageSize, 20);
      expect(response.nextCursor, isNull);
    });

    test('fromCursor factory builds response metadata', () {
      final posts = [
        Post(
          id: 'post2',
          authorId: 'user2',
          authorUsername: 'testuser',
          text: 'Hello again',
          createdAt: testDate,
        ),
      ];

      final response = FeedResponse.fromCursor(
        posts: posts,
        nextCursor: 'cursorXY',
        limit: 30,
      );

      expect(response.posts, posts);
      expect(response.totalCount, 1);
      expect(response.hasMore, true);
      expect(response.nextCursor, 'cursorXY');
      expect(response.page, 1);
      expect(response.pageSize, 30);
    });
  });

  group('FeedParams Model', () {
    test('constructor with defaults', () {
      const params = FeedParams();

      expect(params.page, 1);
      expect(params.pageSize, 20);
      expect(params.cursor, isNull);
      expect(params.type, FeedType.notable);
      expect(params.location, isNull);
      expect(params.tags, isNull);
      expect(params.category, isNull);
    });

    test('constructor with all parameters', () {
      const params = FeedParams(
        page: 2,
        pageSize: 10,
        cursor: 'cursor123',
        type: FeedType.newest,
        location: 'New York',
        tags: ['flutter', 'dart'],
        category: 'tech',
      );

      expect(params.page, 2);
      expect(params.pageSize, 10);
      expect(params.cursor, 'cursor123');
      expect(params.type, FeedType.newest);
      expect(params.location, 'New York');
      expect(params.tags, ['flutter', 'dart']);
      expect(params.category, 'tech');
    });

    test('toJson with defaults', () {
      const params = FeedParams();

      final json = params.toJson();

      expect(json['page'], 1);
      expect(json['pageSize'], 20);
      expect(json['type'], 'notable');
      expect(json.containsKey('cursor'), false);
      expect(json.containsKey('location'), false);
      expect(json.containsKey('tags'), false);
      expect(json.containsKey('category'), false);
    });

    test('toJson with all parameters', () {
      const params = FeedParams(
        page: 2,
        pageSize: 10,
        cursor: 'cursor123',
        type: FeedType.newest,
        location: 'New York',
        tags: ['flutter', 'dart'],
        category: 'tech',
      );

      final json = params.toJson();

      expect(json['page'], 2);
      expect(json['pageSize'], 10);
      expect(json['cursor'], 'cursor123');
      expect(json['type'], 'newest');
      expect(json['location'], 'New York');
      expect(json['tags'], ['flutter', 'dart']);
      expect(json['category'], 'tech');
    });
  });

  group('FeedType Enum', () {
    test('all values', () {
      expect(FeedType.values, [
        FeedType.notable,
        FeedType.newest,
        FeedType.local,
        FeedType.following,
        FeedType.newCreators,
      ]);
    });

    test('enum names', () {
      expect(FeedType.notable.name, 'notable');
      expect(FeedType.newest.name, 'newest');
      expect(FeedType.local.name, 'local');
      expect(FeedType.following.name, 'following');
      expect(FeedType.newCreators.name, 'newCreators');
    });
  });

  group('ContentAuthorship Enum', () {
    test('all values', () {
      expect(ContentAuthorship.values, [
        ContentAuthorship.humanAuthored,
        ContentAuthorship.aiAssisted,
        ContentAuthorship.aiGenerated,
        ContentAuthorship.underReview,
      ]);
    });

    test('labels', () {
      expect(ContentAuthorship.humanAuthored.label, 'Human-authored');
      expect(ContentAuthorship.aiAssisted.label, 'AI-assisted');
      expect(ContentAuthorship.aiGenerated.label, 'AI-generated');
      expect(ContentAuthorship.underReview.label, 'Under review');
    });

    test('fromString with canonical authorship values', () {
      expect(
        ContentAuthorship.fromString('human_authored'),
        ContentAuthorship.humanAuthored,
      );
      expect(
        ContentAuthorship.fromString('human'),
        ContentAuthorship.humanAuthored,
      );
      expect(
        ContentAuthorship.fromString('ai_assisted'),
        ContentAuthorship.aiAssisted,
      );
      expect(
        ContentAuthorship.fromString('ai_generated'),
        ContentAuthorship.aiGenerated,
      );
      expect(
        ContentAuthorship.fromString('ai_gen'),
        ContentAuthorship.aiGenerated,
      );
      expect(
        ContentAuthorship.fromString('under_review'),
        ContentAuthorship.underReview,
      );
    });

    test('fromString with legacy confidence values', () {
      expect(
        ContentAuthorship.fromString('high'),
        ContentAuthorship.humanAuthored,
      );
      expect(
        ContentAuthorship.fromString('HIGH'),
        ContentAuthorship.humanAuthored,
      );
      expect(
        ContentAuthorship.fromString('medium'),
        ContentAuthorship.aiAssisted,
      );
      expect(
        ContentAuthorship.fromString('MEDIUM'),
        ContentAuthorship.aiAssisted,
      );
      expect(ContentAuthorship.fromString('low'), ContentAuthorship.aiAssisted);
      expect(ContentAuthorship.fromString('LOW'), ContentAuthorship.aiAssisted);
      expect(
        ContentAuthorship.fromString('AI_GENERATED'),
        ContentAuthorship.aiGenerated,
      );
    });

    test('fromString defaults to underReview for unknown values', () {
      expect(
        ContentAuthorship.fromString('invalid'),
        ContentAuthorship.underReview,
      );
      expect(ContentAuthorship.fromString(''), ContentAuthorship.underReview);
      expect(
        ContentAuthorship.fromString('unknown'),
        ContentAuthorship.underReview,
      );
      expect(ContentAuthorship.fromString(null), ContentAuthorship.underReview);
    });

    test('displayLabel', () {
      expect(ContentAuthorship.humanAuthored.displayLabel, 'Human-authored');
      expect(ContentAuthorship.aiAssisted.displayLabel, 'AI-assisted');
      expect(ContentAuthorship.aiGenerated.displayLabel, 'AI-generated');
      expect(ContentAuthorship.underReview.displayLabel, 'Under review');
    });
  });
}

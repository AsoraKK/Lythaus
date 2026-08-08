// ignore_for_file: public_member_api_docs

library social_feed_repository;

/// LYTHAUS SOCIAL FEED REPOSITORY
///
/// 🎯 Purpose: Abstract interface for social media feed operations
/// 🏗️ Architecture: Domain layer - defines business contracts for posts and feeds
/// 🔐 Dependency Rule: Application layer implements this interface
/// 📱 Platform: Flutter with Clean Architecture compliance

import 'package:lythaus/features/feed/domain/models.dart';

/// Abstract repository defining social feed operations
///
/// This interface separates the social media feed concerns from voting/appeals:
/// - Domain layer defines WHAT operations are needed
/// - Application layer implements HOW they work
/// - UI layer uses providers that depend on this interface
abstract class SocialFeedRepository {
  /// Get main social media feed with posts
  ///
  /// [params] - Feed parameters including pagination, type, filters
  /// [token] - Optional user authentication token
  ///
  /// Returns paginated feed response with posts and AI moderation data
  /// Throws [SocialFeedException] on request failure
  Future<FeedResponse> getFeed({required FeedParams params, String? token});

  /// Fetch discover feed (public) with cursor pagination.
  Future<FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
  });

  /// Fetch news feed (public) with cursor pagination.
  Future<FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  });

  /// Fetch a user's timeline feed.
  Future<FeedResponse> getUserFeed({
    required String userId,
    String? cursor,
    int limit = 25,
    String? token,
    bool includeReplies = false,
  });

  /// Get trending posts feed
  ///
  /// [page] - Page number for pagination (defaults to 1)
  /// [pageSize] - Number of posts per page (defaults to 20)
  /// [token] - Optional user authentication token
  ///
  /// Returns trending posts based on engagement metrics
  Future<FeedResponse> getTrendingFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  });

  /// Get local/regional posts feed
  ///
  /// [location] - Geographic location for filtering
  /// [radius] - Search radius in kilometers (optional)
  /// [page] - Page number for pagination
  /// [pageSize] - Number of posts per page
  /// [token] - Optional user authentication token
  ///
  /// Returns posts from users in the specified location
  Future<FeedResponse> getLocalFeed({
    required String location,
    double? radius,
    int page = 1,
    int pageSize = 20,
    String? token,
  });

  /// Get new creators feed
  ///
  /// [page] - Page number for pagination
  /// [pageSize] - Number of posts per page
  /// [token] - Optional user authentication token
  ///
  /// Returns posts from recently joined users
  Future<FeedResponse> getNewCreatorsFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  });

  /// Get posts from users the current user follows
  ///
  /// [page] - Page number for pagination
  /// [pageSize] - Number of posts per page
  /// [token] - User authentication token (required)
  ///
  /// Returns posts from followed users in chronological order
  /// Throws [SocialFeedException] if user not authenticated
  Future<FeedResponse> getFollowingFeed({
    int page = 1,
    int pageSize = 20,
    required String token,
  });

  /// Get a specific post by ID
  ///
  /// [postId] - Unique identifier for the post
  /// [token] - Optional user authentication token
  ///
  /// Returns the post with full details including moderation data
  /// Throws [SocialFeedException] if post not found
  Future<Post> getPost({required String postId, String? token});

  /// Like or unlike a post
  ///
  /// [postId] - Unique identifier for the post
  /// [isLike] - true for like, false for unlike
  /// [token] - User authentication token (required)
  ///
  /// Returns updated post with new like count
  /// Throws [SocialFeedException] if user not authenticated
  Future<Post> likePost({
    required String postId,
    required bool isLike,
    required String token,
  });

  /// Dislike or remove dislike from a post
  ///
  /// [postId] - Unique identifier for the post
  /// [isDislike] - true for dislike, false for remove dislike
  /// [token] - User authentication token (required)
  ///
  /// Returns updated post with new dislike count
  /// Throws [SocialFeedException] if user not authenticated
  Future<Post> dislikePost({
    required String postId,
    required bool isDislike,
    required String token,
  });

  /// Get comments for a specific post
  ///
  /// [postId] - Unique identifier for the post
  /// [page] - Page number for pagination
  /// [pageSize] - Number of comments per page
  /// [token] - Optional user authentication token
  ///
  /// Returns paginated list of comments with threading support
  Future<List<Comment>> getComments({
    required String postId,
    int page = 1,
    int pageSize = 50,
    String? token,
  });

  /// Flag/report a post for moderation review
  ///
  /// [postId] - Unique identifier for the post
  /// [reason] - Reason for flagging (spam, harassment, etc.)
  /// [details] - Optional additional details
  /// [token] - User authentication token (required)
  ///
  /// Throws [SocialFeedException] if user not authenticated
  Future<void> flagPost({
    required String postId,
    required String reason,
    String? details,
    required String token,
  });
}

/// Domain exception for social feed operations
class SocialFeedException implements Exception {
  final String message;
  final String? code;
  final dynamic originalError;

  const SocialFeedException(this.message, {this.code, this.originalError});

  @override
  String toString() => 'SocialFeedException: $message';
}

/// Feed metrics and statistics
class SocialFeedMetrics {
  final int totalPosts;
  final int totalActiveUsers;
  final int postsToday;
  final double averageEngagement;
  final Map<String, int> topCategories;
  final List<String> trendingTags;

  const SocialFeedMetrics({
    required this.totalPosts,
    required this.totalActiveUsers,
    required this.postsToday,
    required this.averageEngagement,
    required this.topCategories,
    required this.trendingTags,
  });

  factory SocialFeedMetrics.fromJson(Map<String, dynamic> json) {
    final topCategories = json['topCategories'];
    final trendingTags = json['trendingTags'];
    final averageEngagement = json['averageEngagement'];
    return SocialFeedMetrics(
      totalPosts: json['totalPosts'] as int? ?? 0,
      totalActiveUsers: json['totalActiveUsers'] as int? ?? 0,
      postsToday: json['postsToday'] as int? ?? 0,
      averageEngagement: averageEngagement is num
          ? averageEngagement.toDouble()
          : 0.0,
      topCategories: topCategories is Map
          ? Map<String, int>.from(topCategories)
          : const <String, int>{},
      trendingTags: trendingTags is List
          ? trendingTags.whereType<String>().toList()
          : const <String>[],
    );
  }
}

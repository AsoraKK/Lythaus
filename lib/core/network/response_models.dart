// ignore_for_file: public_member_api_docs

/// LYTHAUS API RESPONSE MODELS
///
/// 🎯 Purpose: Response models for native Lythaus API integration
/// 🏗️ Architecture: Domain layer models for API responses
/// 🔐 Data: Post creation, feed pagination, user profile responses
/// 📱 Platform: Flutter with JSON serialization
library;

/// Response model for post creation API calls
class PostCreateResponse {
  final bool success;
  final String? postId;
  final String? message;
  final Map<String, dynamic>? moderationResult;
  final DateTime? createdAt;

  const PostCreateResponse({
    required this.success,
    this.postId,
    this.message,
    this.moderationResult,
    this.createdAt,
  });

  factory PostCreateResponse.fromJson(Map<String, dynamic> json) {
    return PostCreateResponse(
      success: json['success'] as bool? ?? false,
      postId: json['postId'] as String?,
      message: json['message'] as String?,
      moderationResult: json['moderationResult'] is Map
          ? Map<String, dynamic>.from(json['moderationResult'] as Map)
          : null,
      createdAt: json['createdAt'] is String
          ? DateTime.parse(json['createdAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'success': success,
      if (postId != null) 'postId': postId,
      if (message != null) 'message': message,
      if (moderationResult != null) 'moderationResult': moderationResult,
      if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
    };
  }
}

/// Response model for feed API calls with pagination
class FeedResponse {
  final bool success;
  final List<Map<String, dynamic>> feed;
  final String? nextCursor;
  final String? message;
  final FeedMetadata? metadata;

  const FeedResponse({
    required this.success,
    required this.feed,
    this.nextCursor,
    this.message,
    this.metadata,
  });

  factory FeedResponse.fromJson(Map<String, dynamic> json) {
    final feedItems = json['feed'];
    return FeedResponse(
      success: json['success'] as bool? ?? false,
      feed: feedItems is List
          ? feedItems
                .whereType<Map<String, dynamic>>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
          : const <Map<String, dynamic>>[],
      nextCursor: json['nextCursor'] as String?,
      message: json['message'] as String?,
      metadata: json['metadata'] is Map
          ? FeedMetadata.fromJson(
              Map<String, dynamic>.from(json['metadata'] as Map),
            )
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'success': success,
      'feed': feed,
      if (nextCursor != null) 'nextCursor': nextCursor,
      if (message != null) 'message': message,
      if (metadata != null) 'metadata': metadata!.toJson(),
    };
  }
}

/// Metadata included with feed responses
class FeedMetadata {
  final int totalCount;
  final bool hasMore;
  final String? algorithm;
  final bool? cached;
  final DateTime? cacheExpiry;

  const FeedMetadata({
    required this.totalCount,
    required this.hasMore,
    this.algorithm,
    this.cached,
    this.cacheExpiry,
  });

  factory FeedMetadata.fromJson(Map<String, dynamic> json) {
    return FeedMetadata(
      totalCount: json['totalCount'] as int? ?? 0,
      hasMore: json['hasMore'] as bool? ?? false,
      algorithm: json['algorithm'] as String?,
      cached: json['cached'] as bool?,
      cacheExpiry: json['cacheExpiry'] is String
          ? DateTime.parse(json['cacheExpiry'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'totalCount': totalCount,
      'hasMore': hasMore,
      if (algorithm != null) 'algorithm': algorithm,
      if (cached != null) 'cached': cached,
      if (cacheExpiry != null) 'cacheExpiry': cacheExpiry!.toIso8601String(),
    };
  }
}

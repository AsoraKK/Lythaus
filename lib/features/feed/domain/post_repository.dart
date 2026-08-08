// ignore_for_file: public_member_api_docs

/// LYTHAUS POST REPOSITORY
///
/// 🎯 Purpose: Abstract interface for post CRUD operations
/// 🏗️ Architecture: Domain layer - defines business contracts
/// 🔐 Dependency Rule: Application layer implements this interface
/// 📱 Platform: Flutter with Clean Architecture compliance
library;

import 'package:lythaus/features/feed/domain/models.dart';

/// Result of a post creation attempt
sealed class CreatePostResult {
  const CreatePostResult();
}

/// Successful post creation
class CreatePostSuccess extends CreatePostResult {
  final Post post;
  const CreatePostSuccess(this.post);
}

/// Post was blocked by content moderation
class CreatePostBlocked extends CreatePostResult {
  final String message;
  final List<String> categories;
  final String code;
  final bool appealEligible;
  final String? appealCaseId;

  const CreatePostBlocked({
    required this.message,
    required this.categories,
    this.code = 'content_blocked',
    this.appealEligible = false,
    this.appealCaseId,
  });
}

/// Daily post limit exceeded
class CreatePostLimitExceeded extends CreatePostResult {
  final String message;
  final int limit;
  final int currentCount;
  final String tier;
  final Duration retryAfter;

  const CreatePostLimitExceeded({
    required this.message,
    required this.limit,
    required this.currentCount,
    required this.tier,
    required this.retryAfter,
  });
}

/// Post creation failed with a generic error
class CreatePostError extends CreatePostResult {
  final String message;
  final String? code;
  final dynamic originalError;

  const CreatePostError({required this.message, this.code, this.originalError});
}

/// Request model for creating a post
class CreatePostRequest {
  final String text;
  final String? mediaUrl;
  final bool isNews;
  final String contentType;
  final String aiLabel;
  final ProofSignals proofSignals;

  const CreatePostRequest({
    required this.text,
    this.mediaUrl,
    this.isNews = false,
    this.contentType = 'text',
    this.aiLabel = 'human',
    this.proofSignals = const ProofSignals(),
  });

  Map<String, dynamic> toJson() => {
    'body': text,
    'declaredCreationMode': switch (aiLabel) {
      'assisted' => 'ai_assisted',
      'generated' => 'ai_generated',
      _ => 'human',
    },
    'geoScope': 'none',
  };
}

/// Request model for editing an existing post
class UpdatePostRequest {
  final String? text;
  final String? mediaUrl;
  final bool? isNews;
  final String? contentType;
  final String? aiLabel;
  final ProofSignals? proofSignals;

  const UpdatePostRequest({
    this.text,
    this.mediaUrl,
    this.isNews,
    this.contentType,
    this.aiLabel,
    this.proofSignals,
  });

  bool get isEmpty =>
      text == null &&
      mediaUrl == null &&
      isNews == null &&
      contentType == null &&
      aiLabel == null &&
      proofSignals == null;

  Map<String, dynamic> toJson() => {
    if (text != null) 'content': text,
    if (mediaUrl != null) 'mediaUrls': [mediaUrl],
    if (isNews != null) 'isNews': isNews,
    if (contentType != null) 'contentType': contentType,
    if (aiLabel != null) 'aiLabel': aiLabel,
    if (proofSignals != null && proofSignals!.hasAny)
      'proofSignals': proofSignals!.toJson(),
  };
}

class ProofSignals {
  final String? captureMetadataHash;
  final String? editHistoryHash;
  final String? sourceAttestationUrl;

  const ProofSignals({
    this.captureMetadataHash,
    this.editHistoryHash,
    this.sourceAttestationUrl,
  });

  bool get hasAny =>
      (captureMetadataHash?.trim().isNotEmpty ?? false) ||
      (editHistoryHash?.trim().isNotEmpty ?? false) ||
      (sourceAttestationUrl?.trim().isNotEmpty ?? false);

  Map<String, dynamic> toJson() => {
    if (captureMetadataHash?.trim().isNotEmpty ?? false)
      'captureMetadataHash': captureMetadataHash!.trim(),
    if (editHistoryHash?.trim().isNotEmpty ?? false)
      'editHistoryHash': editHistoryHash!.trim(),
    if (sourceAttestationUrl?.trim().isNotEmpty ?? false)
      'sourceAttestationUrl': sourceAttestationUrl!.trim(),
  };
}

/// Abstract repository defining post domain operations
abstract class PostRepository {
  /// Create a new post with content moderation
  ///
  /// [request] - The post content to create
  /// [token] - User authentication token
  ///
  /// Returns [CreatePostResult] which can be:
  /// - [CreatePostSuccess] on successful creation
  /// - [CreatePostBlocked] if content violates guidelines
  /// - [CreatePostLimitExceeded] if daily limit reached
  /// - [CreatePostError] on other failures
  Future<CreatePostResult> createPost({
    required CreatePostRequest request,
    required String token,
  });

  /// Update an existing post with moderation checks
  Future<CreatePostResult> updatePost({
    required String postId,
    required UpdatePostRequest request,
    required String token,
  });

  /// Delete a post
  ///
  /// [postId] - ID of the post to delete
  /// [token] - User authentication token
  ///
  /// Returns true if deletion was successful
  /// Throws [PostException] on failure
  Future<bool> deletePost({required String postId, required String token});

  /// Get a single post by ID
  ///
  /// [postId] - ID of the post to fetch
  /// [token] - Optional authentication token for personalized data
  ///
  /// Returns the post if found
  /// Throws [PostException] if not found or on failure
  Future<Post> getPost({required String postId, String? token});
}

/// Domain exception for post operations
class PostException implements Exception {
  final String message;
  final String? code;
  final dynamic originalError;

  const PostException(this.message, {this.code, this.originalError});

  @override
  String toString() => 'PostException: $message';
}

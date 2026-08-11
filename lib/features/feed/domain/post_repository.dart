// ignore_for_file: public_member_api_docs

/// LYTHAUS POST REPOSITORY
///
/// 🎯 Purpose: Abstract interface for post CRUD operations
/// 🏗️ Architecture: Domain layer - defines business contracts
/// 🔐 Dependency Rule: Application layer implements this interface
/// 📱 Platform: Flutter with Clean Architecture compliance
library;

import 'package:characters/characters.dart';
import 'package:lythaus/features/feed/domain/models.dart';

/// The public authorship modes accepted by the current API policy.
const Set<String> supportedPublicAuthorshipLabels = <String>{
  'human',
  'assisted',
};

/// The public-text limit for content disclosed as AI-assisted.
const int aiAssistedPublicTextMaxGraphemes = 249;

/// Counts the trimmed user-perceived characters used by backend policy.
int userPerceivedCharacterCount(String value) => value.trim().characters.length;

bool isSupportedPublicAuthorshipLabel(String? value) =>
    value != null &&
    supportedPublicAuthorshipLabels.contains(value.trim().toLowerCase());

/// Mirrors public-post policy for immediate feedback. The backend remains
/// authoritative when the request is submitted.
String? validatePublicPostAuthorship({
  required String text,
  required String? aiLabel,
}) {
  final normalizedLabel = aiLabel?.trim().toLowerCase();
  if (normalizedLabel == null || normalizedLabel.isEmpty) {
    return 'Choose an authorship disclosure before posting';
  }
  if (!isSupportedPublicAuthorshipLabel(normalizedLabel)) {
    return 'AI-generated public content cannot be posted';
  }
  if (normalizedLabel == 'assisted' &&
      userPerceivedCharacterCount(text) > aiAssistedPublicTextMaxGraphemes) {
    return 'AI-assisted public text cannot exceed '
        '$aiAssistedPublicTextMaxGraphemes user-perceived characters';
  }
  return null;
}

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

  Map<String, dynamic> toJson() {
    final validationError = validatePublicPostAuthorship(
      text: text,
      aiLabel: aiLabel,
    );
    if (validationError != null) {
      throw ArgumentError.value(aiLabel, 'aiLabel', validationError);
    }

    return {
      'body': text,
      'declaredCreationMode': aiLabel == 'assisted' ? 'ai_assisted' : 'human',
      'geoScope': 'none',
    };
  }
}

/// Request model for editing an existing post
class UpdatePostRequest {
  final String? text;
  final String? aiLabel;
  final String? visibility;

  const UpdatePostRequest({this.text, this.aiLabel, this.visibility});

  bool get isEmpty => text == null && aiLabel == null && visibility == null;

  Map<String, dynamic> toJson() {
    if (text != null && aiLabel == null) {
      throw ArgumentError.value(
        aiLabel,
        'aiLabel',
        'A fresh authorship declaration is required when editing post text.',
      );
    }
    if (text != null && aiLabel != null) {
      final validationError = validatePublicPostAuthorship(
        text: text!,
        aiLabel: aiLabel!,
      );
      if (validationError != null) {
        throw ArgumentError.value(aiLabel, 'aiLabel', validationError);
      }
    }
    if (visibility != null &&
        !const {'public', 'followers', 'private'}.contains(visibility)) {
      throw ArgumentError.value(
        visibility,
        'visibility',
        'Invalid visibility.',
      );
    }
    return {
      if (text != null) 'body': text,
      if (aiLabel != null)
        'declaredCreationMode': aiLabel == 'assisted' ? 'ai_assisted' : aiLabel,
      if (visibility != null) 'visibility': visibility,
    };
  }
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

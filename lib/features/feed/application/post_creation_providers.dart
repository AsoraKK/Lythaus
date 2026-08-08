// ignore_for_file: public_member_api_docs

/// LYTHAUS POST CREATION PROVIDERS
///
/// 🎯 Purpose: Riverpod providers for post creation state management
/// 🏗️ Architecture: Application layer - manages state and dependencies
/// 🔐 Dependency Rule: UI depends on these providers, not on services directly
/// 📱 Platform: Flutter with Riverpod state management
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';

/// Provider for the post repository implementation
final postRepositoryProvider = Provider<PostRepository>((ref) {
  final dio = ref.watch(secureDioProvider);
  return PostRepositoryImpl(dio);
});

/// State for the post creation form
class PostCreationState {
  final String text;
  final String? mediaUrl;
  final bool isSubmitting;
  final CreatePostResult? result;
  final String? validationError;
  final bool isNews;
  final String contentType;
  final String? aiLabel;
  final ProofSignals proofSignals;

  const PostCreationState({
    this.text = '',
    this.mediaUrl,
    this.isSubmitting = false,
    this.result,
    this.validationError,
    this.isNews = false,
    this.contentType = 'text',
    this.aiLabel,
    this.proofSignals = const ProofSignals(),
  });

  PostCreationState copyWith({
    String? text,
    String? mediaUrl,
    bool? isSubmitting,
    CreatePostResult? result,
    String? validationError,
    bool? isNews,
    String? contentType,
    String? aiLabel,
    ProofSignals? proofSignals,
    bool clearMediaUrl = false,
    bool clearResult = false,
    bool clearValidationError = false,
  }) {
    return PostCreationState(
      text: text ?? this.text,
      mediaUrl: clearMediaUrl ? null : (mediaUrl ?? this.mediaUrl),
      isSubmitting: isSubmitting ?? this.isSubmitting,
      result: clearResult ? null : (result ?? this.result),
      validationError: clearValidationError
          ? null
          : (validationError ?? this.validationError),
      isNews: isNews ?? this.isNews,
      contentType: contentType ?? this.contentType,
      aiLabel: aiLabel ?? this.aiLabel,
      proofSignals: proofSignals ?? this.proofSignals,
    );
  }

  /// Check if the form is valid for submission
  bool get isValid =>
      text.trim().isNotEmpty && text.length <= 5000 && aiLabel != null;

  /// Check if there's a successful result
  bool get isSuccess => result is CreatePostSuccess;

  /// Check if content was blocked
  bool get isBlocked => result is CreatePostBlocked;

  /// Check if limit was exceeded
  bool get isLimitExceeded => result is CreatePostLimitExceeded;

  /// Check if there was an error
  bool get hasError => result is CreatePostError;

  /// Get the created post if successful
  CreatePostSuccess? get successResult =>
      result is CreatePostSuccess ? result as CreatePostSuccess : null;

  /// Get blocked result if content was blocked
  CreatePostBlocked? get blockedResult =>
      result is CreatePostBlocked ? result as CreatePostBlocked : null;

  /// Get limit exceeded result
  CreatePostLimitExceeded? get limitExceededResult =>
      result is CreatePostLimitExceeded
      ? result as CreatePostLimitExceeded
      : null;

  /// Get error result
  CreatePostError? get errorResult =>
      result is CreatePostError ? result as CreatePostError : null;
}

/// Minimum text length for posts
const int postTextMinLength = 1;

/// Maximum text length for posts
const int postTextMaxLength = 5000;

/// Notifier for post creation state
class PostCreationNotifier extends StateNotifier<PostCreationState> {
  PostCreationNotifier(this._ref) : super(const PostCreationState());

  final Ref _ref;

  /// Update the post text
  void updateText(String text) {
    String? validationError;

    if (text.isEmpty) {
      validationError = null; // Don't show error for empty field
    } else if (text.length > postTextMaxLength) {
      validationError = 'Post text cannot exceed $postTextMaxLength characters';
    }

    state = state.copyWith(
      text: text,
      clearResult: true,
      validationError: validationError,
      clearValidationError: validationError == null,
    );
  }

  void setIsNews(bool value) {
    state = state.copyWith(isNews: value, clearResult: true);
  }

  void setContentType(String value) {
    state = state.copyWith(contentType: value, clearResult: true);
  }

  void setAiLabel(String value) {
    state = state.copyWith(aiLabel: value, clearResult: true);
  }

  void updateCaptureMetadataHash(String? value) {
    state = state.copyWith(
      proofSignals: ProofSignals(
        captureMetadataHash: value,
        editHistoryHash: state.proofSignals.editHistoryHash,
        sourceAttestationUrl: state.proofSignals.sourceAttestationUrl,
      ),
      clearResult: true,
    );
  }

  void updateEditHistoryHash(String? value) {
    state = state.copyWith(
      proofSignals: ProofSignals(
        captureMetadataHash: state.proofSignals.captureMetadataHash,
        editHistoryHash: value,
        sourceAttestationUrl: state.proofSignals.sourceAttestationUrl,
      ),
      clearResult: true,
    );
  }

  void updateSourceAttestationUrl(String? value) {
    state = state.copyWith(
      proofSignals: ProofSignals(
        captureMetadataHash: state.proofSignals.captureMetadataHash,
        editHistoryHash: state.proofSignals.editHistoryHash,
        sourceAttestationUrl: value,
      ),
      clearResult: true,
    );
  }

  /// Update the media URL
  void updateMediaUrl(String? url) {
    state = state.copyWith(
      mediaUrl: url,
      clearMediaUrl: url == null || url.isEmpty,
      clearResult: true,
    );
  }

  /// Validate the form before submission
  String? validate() {
    final text = state.text.trim();

    if (text.isEmpty) {
      return 'Please enter some text for your post';
    }

    if (text.length < postTextMinLength) {
      return 'Post text is too short';
    }

    if (text.length > postTextMaxLength) {
      return 'Post text cannot exceed $postTextMaxLength characters';
    }

    if (state.aiLabel == null) {
      return 'Choose an authorship disclosure before posting';
    }

    return null;
  }

  /// Submit the post
  Future<bool> submit() async {
    // Validate first
    final validationError = validate();
    if (validationError != null) {
      state = state.copyWith(validationError: validationError);
      return false;
    }

    // Get auth token
    final token = await _ref.read(jwtProvider.future);
    if (token == null) {
      state = state.copyWith(
        result: const CreatePostError(
          message: 'Please sign in to create a post',
          code: 'auth_required',
        ),
      );
      return false;
    }

    // Set submitting state
    state = state.copyWith(
      isSubmitting: true,
      clearResult: true,
      clearValidationError: true,
    );

    try {
      final repository = _ref.read(postRepositoryProvider);

      final result = await repository.createPost(
        request: CreatePostRequest(
          text: state.text.trim(),
          mediaUrl: state.mediaUrl,
          isNews: state.isNews,
          contentType: state.contentType,
          aiLabel: state.aiLabel!,
          proofSignals: state.proofSignals,
        ),
        token: token,
      );

      state = state.copyWith(isSubmitting: false, result: result);

      // If successful, refresh feeds
      if (result is CreatePostSuccess) {
        _refreshFeeds();
        return true;
      }

      return false;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        result: CreatePostError(
          message: 'Failed to create post: ${e.toString()}',
          originalError: e,
        ),
      );
      return false;
    }
  }

  /// Refresh all feed providers to show the new post
  void _refreshFeeds() {
    // Invalidate general feed (all active instances via family)
    _ref.invalidate(feedProvider);

    // Invalidate trending feed
    _ref.invalidate(trendingFeedProvider);

    // Invalidate new creators feed
    _ref.invalidate(newCreatorsFeedProvider);
  }

  /// Reset the form to initial state
  void reset() {
    state = const PostCreationState();
  }

  /// Clear any error state
  void clearError() {
    state = state.copyWith(clearResult: true, clearValidationError: true);
  }
}

/// Provider for post creation state
final postCreationProvider =
    StateNotifierProvider<PostCreationNotifier, PostCreationState>((ref) {
      return PostCreationNotifier(ref);
    });

/// Provider that exposes whether user can create posts
final canCreatePostProvider = Provider<bool>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.maybeWhen(data: (user) => user != null, orElse: () => false);
});

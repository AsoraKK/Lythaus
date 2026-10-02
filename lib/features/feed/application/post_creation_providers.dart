// ignore_for_file: public_member_api_docs

/// LYTHAUS POST CREATION PROVIDERS
///
/// 🎯 Purpose: Riverpod providers for post creation state management
/// 🏗️ Architecture: Application layer - manages state and dependencies
/// 🔐 Dependency Rule: UI depends on these providers, not on services directly
/// 📱 Platform: Flutter with Riverpod state management
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/state/providers/feed_providers.dart' as live;

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
  final bool isRestoring;
  final String? draftStatus;

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
    this.isRestoring = false,
    this.draftStatus,
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
    bool? isRestoring,
    String? draftStatus,
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
      isRestoring: isRestoring ?? this.isRestoring,
      draftStatus: draftStatus ?? this.draftStatus,
    );
  }

  int get userPerceivedTextLength => userPerceivedCharacterCount(text);

  /// Check if the form is valid for submission.
  bool get isValid =>
      text.trim().isNotEmpty &&
      text.length <= postTextMaxLength &&
      validatePublicPostAuthorship(text: text, aiLabel: aiLabel) == null;

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
  PostCreationNotifier(this._ref) : super(const PostCreationState()) {
    _actor = _ref.read(currentUserProvider)?.id ?? 'session';
    _restored = _restore();
    _ref.listen(currentUserProvider, (previous, next) {
      if (previous?.id == next?.id) return;
      _actor = next?.id ?? 'session';
      ++_sessionEpoch;
      ++_version;
      state = const PostCreationState();
      _restored = _restore();
    });
  }

  final Ref _ref;
  late String _actor;
  late Future<void> _restored;
  int _version = 0;
  int _sessionEpoch = 0;
  String get _scope => 'post-create:$_actor';

  void refreshDraftOnOpen() {
    if (state.isSubmitting || state.isRestoring || state.draftStatus == null) {
      return;
    }
    _restored = _restore();
  }

  Future<void> _restore() async {
    final actor = _actor;
    final version = _version;
    final sessionEpoch = _sessionEpoch;
    if (actor == 'session') return;
    state = state.copyWith(isRestoring: true);
    final loadingState = state;
    final registry = _ref.read(contentMutationRegistryProvider);
    await registry.refresh();
    if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) return;
    if (version != _version || !identical(state, loadingState)) {
      state = state.copyWith(isRestoring: false);
      return;
    }
    final pending = registry.pending(_scope);
    final saved = pending != null && !pending.needsReentry
        ? pending.payload
        : registry.draft(_scope);
    state = PostCreationState(
      text: saved?['body'] as String? ?? '',
      aiLabel: saved?['declaredCreationMode'] == 'ai_assisted'
          ? 'assisted'
          : saved?['declaredCreationMode'] == 'human'
          ? 'human'
          : null,
      result: pending != null && !pending.needsReentry
          ? const CreatePostError(
              message: 'Retry to check the saved submission.',
              outcomeUncertain: true,
            )
          : null,
      draftStatus: registry.storageUnavailable
          ? 'Recovery storage is unavailable.'
          : pending?.needsReentry == true
          ? 'Saved text expired or was cleared at logout. Re-enter the same text and disclosure to check the previous request.'
          : saved == null
          ? null
          : 'Draft restored on this device.',
    );
  }

  void _persist() {
    ++_version;
    if (_actor == 'session') return;
    final actor = _actor;
    final version = _version;
    final registry = _ref.read(contentMutationRegistryProvider);
    final data = state.text.isEmpty
        ? null
        : <String, dynamic>{
            'body': state.text,
            'declaredCreationMode': state.aiLabel == 'assisted'
                ? 'ai_assisted'
                : state.aiLabel == 'human'
                ? 'human'
                : null,
          };
    state = state.copyWith(draftStatus: 'Saving draft…');
    unawaited(
      registry.saveDraft(_scope, data).then((saved) {
        if (!mounted || actor != _actor || version != _version) return;
        state = state.copyWith(
          draftStatus: saved
              ? 'Draft saved on this device.'
              : 'Draft could not be saved on this device.',
        );
      }),
    );
  }

  bool get _canEdit =>
      !state.isSubmitting && state.errorResult?.outcomeUncertain != true;

  /// Update the post text
  void updateText(String text) {
    if (!_canEdit) return;
    String? validationError;

    if (text.isEmpty) {
      validationError = null; // Don't show error for empty field
    } else if (text.length > postTextMaxLength) {
      validationError = 'Post text cannot exceed $postTextMaxLength characters';
    } else if (state.aiLabel != null) {
      validationError = validatePublicPostAuthorship(
        text: text,
        aiLabel: state.aiLabel,
      );
    }

    state = state.copyWith(
      text: text,
      clearResult: true,
      validationError: validationError,
      clearValidationError: validationError == null,
    );
    _persist();
  }

  void setIsNews(bool value) {
    if (!_canEdit) return;
    state = state.copyWith(isNews: value, clearResult: true);
  }

  void setContentType(String value) {
    if (!_canEdit) return;
    state = state.copyWith(contentType: value, clearResult: true);
  }

  void setAiLabel(String value) {
    if (!_canEdit) return;
    final normalizedValue = value.trim().toLowerCase();
    if (!isSupportedPublicAuthorshipLabel(normalizedValue)) {
      state = state.copyWith(
        clearResult: true,
        validationError: 'AI-generated public content cannot be posted',
      );
      return;
    }

    final validationError = state.text.isEmpty
        ? null
        : validatePublicPostAuthorship(
            text: state.text,
            aiLabel: normalizedValue,
          );
    state = state.copyWith(
      aiLabel: normalizedValue,
      clearResult: true,
      validationError: validationError,
      clearValidationError: validationError == null,
    );
    _persist();
  }

  void updateCaptureMetadataHash(String? value) {
    if (!_canEdit) return;
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
    if (!_canEdit) return;
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
    if (!_canEdit) return;
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
    if (!_canEdit) return;
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

    return validatePublicPostAuthorship(text: text, aiLabel: state.aiLabel);
  }

  /// Submit the post
  Future<bool> submit() async {
    if (state.isSubmitting || state.isSuccess) return false;
    // Validate first
    final validationError = validate();
    if (validationError != null) {
      state = state.copyWith(validationError: validationError);
      return false;
    }

    final draft = state;
    final sessionEpoch = _sessionEpoch;
    final actor = _ref.read(currentUserProvider)?.id ?? 'session';
    final registry = _ref.read(contentMutationRegistryProvider);
    ContentMutationAttempt? attempt;
    state = state.copyWith(
      isSubmitting: true,
      clearResult: true,
      clearValidationError: true,
    );

    try {
      await _restored;
      final token = await _ref.read(jwtProvider.future);
      if (!mounted || sessionEpoch != _sessionEpoch) return false;
      if (token == null ||
          token.isEmpty ||
          (_ref.read(currentUserProvider)?.id ?? 'session') != actor) {
        state = state.copyWith(
          isSubmitting: false,
          result: const CreatePostError(
            message: 'Please sign in to create a post',
            code: 'auth_required',
          ),
        );
        return false;
      }
      final repository = _ref.read(postRepositoryProvider);
      final request = CreatePostRequest(
        text: draft.text.trim(),
        mediaUrl: draft.mediaUrl,
        isNews: draft.isNews,
        contentType: draft.contentType,
        aiLabel: draft.aiLabel!,
        proofSignals: draft.proofSignals,
      );
      attempt = await registry.beginDurable(
        'post-create:$actor',
        request.toJson(),
      );
      final result = await repository.createPost(
        request: CreatePostRequest(
          text: request.text,
          mediaUrl: request.mediaUrl,
          isNews: request.isNews,
          contentType: request.contentType,
          aiLabel: request.aiLabel,
          proofSignals: request.proofSignals,
          idempotencyKey: attempt.key,
        ),
        token: token,
      );
      await registry.finishDurable(
        attempt,
        uncertain: result is CreatePostError && result.outcomeUncertain,
        receipt: result is CreatePostSuccess
            ? OwnedContent('post', result.post.id)
            : null,
      );
      if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) {
        return false;
      }
      final unconfirmed = registry.pending(attempt.scope) != null;
      state = state.copyWith(
        isSubmitting: false,
        result: unconfirmed && result is! CreatePostSuccess
            ? const CreatePostError(
                message:
                    'The earlier submission is still unconfirmed. Retry the same request after signing in.',
                outcomeUncertain: true,
              )
            : result,
      );

      // If successful, refresh feeds
      if (result is CreatePostSuccess) {
        _refreshFeeds();
        return true;
      }

      return false;
    } catch (e) {
      final failure = contentMutationFailure(e);
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted || actor != _actor || sessionEpoch != _sessionEpoch) {
        return false;
      }
      state = state.copyWith(
        isSubmitting: false,
        result: CreatePostError(
          message: failure.message,
          originalError: e,
          code: failure.code,
          outcomeUncertain:
              registry.pending('post-create:$actor')?.needsReentry != true &&
              (failure.uncertain ||
                  registry.pending('post-create:$actor') != null),
        ),
      );
      return false;
    }
  }

  /// Refresh all feed providers to show the new post
  void _refreshFeeds() {
    _ref.invalidate(live.liveFeedStateProvider);
    _ref.invalidate(live.liveFeedItemsProvider);
    // Invalidate general feed (all active instances via family)
    _ref.invalidate(feedProvider);

    // Invalidate trending feed
    _ref.invalidate(trendingFeedProvider);

    // Invalidate new creators feed
    _ref.invalidate(newCreatorsFeedProvider);
  }

  /// Reset the form to initial state
  void reset() {
    if (!_canEdit) return;
    state = const PostCreationState();
    _persist();
  }

  /// Clear any error state
  void clearError() {
    if (!_canEdit) return;
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

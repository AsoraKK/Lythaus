// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';

const Set<String> _postVisibilityValues = {'public', 'followers', 'private'};
const Set<String> _postReviewValues = {'allowed', 'under_review'};
const Set<String> _postCreationValues = {'human', 'ai_assisted'};

@immutable
class OwnerPost {
  const OwnerPost({
    required this.id,
    required this.authorId,
    required this.body,
    required this.declaredCreationMode,
    required this.moderationState,
    required this.visibility,
    required this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String authorId;
  final String body;
  final String declaredCreationMode;
  final String moderationState;
  final String visibility;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isPending => moderationState == 'under_review';

  String get statusLabel {
    if (isPending) return 'Awaiting review';
    if (publishedAt == null) return 'Approved';
    return switch (visibility) {
      'followers' => 'Followers only',
      'private' => 'Private',
      _ => 'Published',
    };
  }

  factory OwnerPost.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final authorId = json['authorId'];
    final body = json['body'];
    final creationMode = json['declaredCreationMode'];
    final moderationState = json['moderationState'];
    final visibility = json['visibility'];
    if (id is! String || id.isEmpty ||
        authorId is! String || authorId.isEmpty ||
        body is! String ||
        creationMode is! String || !_postCreationValues.contains(creationMode) ||
        moderationState is! String || !_postReviewValues.contains(moderationState) ||
        visibility is! String || !_postVisibilityValues.contains(visibility)) {
      throw const FormatException('Invalid owner post');
    }
    return OwnerPost(
      id: id,
      authorId: authorId,
      body: body,
      declaredCreationMode: creationMode,
      moderationState: moderationState,
      visibility: visibility,
      publishedAt: _parseOptionalDate(json['publishedAt']),
      createdAt: _parseRequiredDate(json['createdAt']),
      updatedAt: _parseRequiredDate(json['updatedAt']),
    );
  }

  static DateTime? _parseOptionalDate(Object? value) {
    if (value == null) return null;
    if (value is String) {
      final parsed = DateTime.tryParse(value);
      if (parsed != null) return parsed.toUtc();
    }
    throw const FormatException('Invalid owner post date');
  }

  static DateTime _parseRequiredDate(Object? value) {
    final parsed = _parseOptionalDate(value);
    if (parsed == null) throw const FormatException('Missing owner post date');
    return parsed;
  }
}

@immutable
class OwnerPostsPage {
  const OwnerPostsPage({required this.items, required this.nextCursor});

  final List<OwnerPost> items;
  final String? nextCursor;

  factory OwnerPostsPage.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final rawCursor = json['nextCursor'];
    if (rawItems is! List || (rawCursor != null && rawCursor is! String)) {
      throw const FormatException('Invalid owner posts page');
    }
    return OwnerPostsPage(
      items: rawItems.map((item) {
        if (item is! Map) throw const FormatException('Invalid owner post');
        return OwnerPost.fromJson(Map<String, dynamic>.from(item));
      }).toList(growable: false),
      nextCursor: rawCursor as String?,
    );
  }
}

@immutable
class OwnerPostsKey {
  const OwnerPostsKey({required this.userId, required this.sessionRevision});

  final String userId;
  final int sessionRevision;

  @override
  bool operator ==(Object other) =>
      other is OwnerPostsKey &&
      other.userId == userId &&
      other.sessionRevision == sessionRevision;

  @override
  int get hashCode => Object.hash(userId, sessionRevision);
}

@immutable
class OwnerPostsTimeline {
  const OwnerPostsTimeline({
    required this.items,
    required this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  final List<OwnerPost> items;
  final String? nextCursor;
  final bool isLoadingMore;
  final Object? loadMoreError;

  bool get hasMore => nextCursor != null;

  OwnerPostsTimeline append(OwnerPostsPage page) {
    final posts = <String, OwnerPost>{for (final post in items) post.id: post};
    for (final post in page.items) {
      posts.putIfAbsent(post.id, () => post);
    }
    return OwnerPostsTimeline(
      items: posts.values.toList(growable: false),
      nextCursor: page.nextCursor,
    );
  }

  OwnerPostsTimeline copyWith({
    bool? isLoadingMore,
    Object? loadMoreError,
    bool clearLoadMoreError = false,
  }) => OwnerPostsTimeline(
    items: items,
    nextCursor: nextCursor,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    loadMoreError: clearLoadMoreError ? null : loadMoreError ?? this.loadMoreError,
  );
}

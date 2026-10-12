// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';

@immutable
class OwnerComment {
  const OwnerComment({
    required this.id,
    required this.authorId,
    required this.postId,
    required this.parentId,
    required this.depth,
    required this.body,
    required this.declaredCreationMode,
    required this.moderationState,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String authorId;
  final String postId;
  final String? parentId;
  final int depth;
  final String body;
  final String declaredCreationMode;
  final String moderationState;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isPending => moderationState == 'under_review';
  String get statusLabel => isPending ? 'Awaiting review' : 'Approved';

  factory OwnerComment.fromJson(Map<String, dynamic> json) {
    for (final key in ['id', 'authorId', 'postId', 'body']) {
      if (json[key] is! String || (json[key] as String).isEmpty) {
        throw const FormatException('Invalid owner comment');
      }
    }
    final parentId = json['parentId'];
    final depth = json['depth'];
    final creation = json['declaredCreationMode'];
    final review = json['moderationState'];
    final created = DateTime.tryParse(
      json['createdAt'] is String ? json['createdAt'] as String : '',
    );
    final updated = DateTime.tryParse(
      json['updatedAt'] is String ? json['updatedAt'] as String : '',
    );
    if (!json.containsKey('parentId') ||
        (parentId != null && (parentId is! String || parentId.isEmpty)) ||
        depth is! int ||
        (depth != 0 && depth != 1) ||
        (depth == 0) != (parentId == null) ||
        !const {'human', 'ai_assisted'}.contains(creation) ||
        !const {'allowed', 'under_review'}.contains(review) ||
        json['deleted'] != false ||
        created == null ||
        updated == null) {
      throw const FormatException('Invalid owner comment');
    }
    return OwnerComment(
      id: json['id'] as String,
      authorId: json['authorId'] as String,
      postId: json['postId'] as String,
      parentId: parentId as String?,
      depth: depth,
      body: json['body'] as String,
      declaredCreationMode: creation as String,
      moderationState: review as String,
      createdAt: created.toUtc(),
      updatedAt: updated.toUtc(),
    );
  }
}

@immutable
class OwnerCommentsPage {
  const OwnerCommentsPage({required this.items, required this.nextCursor});

  final List<OwnerComment> items;
  final String? nextCursor;

  factory OwnerCommentsPage.fromJson(Map<String, dynamic> json) {
    final items = json['items'];
    final cursor = json['nextCursor'];
    if (items is! List ||
        !json.containsKey('nextCursor') ||
        (cursor != null && (cursor is! String || cursor.isEmpty))) {
      throw const FormatException('Invalid owner comments page');
    }
    return OwnerCommentsPage(
      items: items
          .map((item) {
            if (item is! Map) {
              throw const FormatException('Invalid owner comment');
            }
            return OwnerComment.fromJson(Map<String, dynamic>.from(item));
          })
          .toList(growable: false),
      nextCursor: cursor as String?,
    );
  }
}

@immutable
class OwnerCommentsKey {
  const OwnerCommentsKey({required this.userId, required this.sessionRevision});

  final String userId;
  final int sessionRevision;

  @override
  bool operator ==(Object other) =>
      other is OwnerCommentsKey &&
      other.userId == userId &&
      other.sessionRevision == sessionRevision;

  @override
  int get hashCode => Object.hash(userId, sessionRevision);
}

@immutable
class OwnerCommentsTimeline {
  const OwnerCommentsTimeline({
    required this.items,
    required this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  final List<OwnerComment> items;
  final String? nextCursor;
  final bool isLoadingMore;
  final Object? loadMoreError;

  bool get hasMore => nextCursor != null;

  OwnerCommentsTimeline append(OwnerCommentsPage page) {
    if (page.nextCursor != null && page.nextCursor == nextCursor) {
      throw const FormatException('Comment pagination did not advance');
    }
    final comments = <String, OwnerComment>{
      for (final item in items) item.id: item,
    };
    for (final item in page.items) {
      comments.putIfAbsent(item.id, () => item);
    }
    return OwnerCommentsTimeline(
      items: comments.values.toList(growable: false),
      nextCursor: page.nextCursor,
    );
  }

  OwnerCommentsTimeline copyWith({
    bool? isLoadingMore,
    Object? loadMoreError,
    bool clearLoadMoreError = false,
  }) => OwnerCommentsTimeline(
    items: items,
    nextCursor: nextCursor,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    loadMoreError: clearLoadMoreError
        ? null
        : loadMoreError ?? this.loadMoreError,
  );
}

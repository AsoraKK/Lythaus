// ignore_for_file: public_member_api_docs

// ─────────────────────────────────────────────────────────────────────────────
// ReactionType enum
// ─────────────────────────────────────────────────────────────────────────────

/// Mirrors the backend `ReactionType` union.
enum ReactionType {
  like,
  insightful,
  support;

  /// Human-readable label for display in the reaction bar.
  String get label {
    switch (this) {
      case ReactionType.like:
        return 'Like';
      case ReactionType.insightful:
        return 'Insightful';
      case ReactionType.support:
        return 'Support';
    }
  }

  /// Wire value sent to / received from the API.
  String get apiValue => name;

  /// Positive (+), negative (-), or neutral (0) direction.
  int get direction {
    switch (this) {
      case ReactionType.like:
      case ReactionType.insightful:
      case ReactionType.support:
        return 1;
    }
  }

  bool get isNegative => direction < 0;
  bool get isPositive => direction > 0;

  static ReactionType? fromApi(String value) {
    for (final e in ReactionType.values) {
      if (e.apiValue == value) return e;
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ReactionSummary — aggregate counts returned by feed/post endpoints
// ─────────────────────────────────────────────────────────────────────────────

class ReactionSummary {
  const ReactionSummary({this.counts = const {}, this.myReactionType});

  final Map<String, int> counts;
  final String? myReactionType;

  factory ReactionSummary.fromJson(Map<String, dynamic> json) {
    final rawCounts = json['counts'];
    final counts = rawCounts is Map<String, dynamic>
        ? rawCounts.map((k, v) => MapEntry(k, (v as num).toInt()))
        : <String, int>{};
    return ReactionSummary(
      counts: counts,
      myReactionType: json['myReactionType'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'counts': counts,
    if (myReactionType != null) 'myReactionType': myReactionType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitReactionRequest — sent to POST /posts/{postId}/reactions
// ─────────────────────────────────────────────────────────────────────────────

class SubmitReactionRequest {
  const SubmitReactionRequest({
    required this.postId,
    required this.reactionType,
  });

  final String postId;
  final String reactionType;

  factory SubmitReactionRequest.fromJson(Map<String, dynamic> json) =>
      SubmitReactionRequest(
        postId: json['postId'] as String,
        reactionType: json['reactionType'] as String,
      );

  Map<String, dynamic> toJson() => {'reactionType': reactionType};
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitReactionResponse — returned by POST /posts/{postId}/reactions
// ─────────────────────────────────────────────────────────────────────────────

class SubmitReactionResponse {
  const SubmitReactionResponse({
    required this.postId,
    required this.reactionType,
    required this.changed,
  });

  final String postId;
  final String reactionType;
  final bool changed;

  factory SubmitReactionResponse.fromJson(Map<String, dynamic> json) =>
      SubmitReactionResponse(
        postId: json['postId'] as String,
        reactionType: json['reactionType'] as String,
        changed: json['changed'] as bool,
      );

  Map<String, dynamic> toJson() => {
    'postId': postId,
    'reactionType': reactionType,
    'changed': changed,
  };
}

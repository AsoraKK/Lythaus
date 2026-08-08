// ignore_for_file: public_member_api_docs

library appeal_models;

/// LYTHAUS APPEAL MODELS
///
/// 🎯 Purpose: Data models for community voting and appeal system
/// 📊 Models: Appeal, Vote, VotingCard, AppealDetails
/// 🔐 Type Safety: Comprehensive validation and serialization
/// 📱 Platform: Flutter with JSON serialization support

/// Content moderation status enum
enum ModerationStatus {
  clean,
  flagged,
  hidden,
  communityApproved,
  communityRejected,
}

/// Appeal status enum
enum AppealStatus { pending, approved, rejected, expired }

/// Appeal model for community voting
class Appeal {
  final String appealId;
  final String contentId;
  final String contentType;
  final String? contentTitle;
  final String contentPreview;
  final String appealType;
  final String appealReason;
  final String userStatement;

  // Submitter info
  final String submitterId;
  final String submitterName;
  final DateTime submittedAt;
  final DateTime expiresAt;

  // Moderation info
  final String flagReason;
  final String authorshipLabel;
  final String classificationSource;
  final String reviewState;
  final List<String> flagCategories;
  final int flagCount;

  // Voting status
  final VotingStatus votingStatus;
  final VotingProgress? votingProgress;
  final int urgencyScore;
  final String estimatedResolution;

  // User voting state
  final bool hasUserVoted;
  final String? userVote; // 'approve' or 'reject'
  final bool canUserVote;
  final String? voteIneligibilityReason;

  const Appeal({
    required this.appealId,
    required this.contentId,
    required this.contentType,
    this.contentTitle,
    required this.contentPreview,
    required this.appealType,
    required this.appealReason,
    required this.userStatement,
    required this.submitterId,
    required this.submitterName,
    required this.submittedAt,
    required this.expiresAt,
    required this.flagReason,
    this.authorshipLabel = 'Under review',
    this.classificationSource = 'automated_classification',
    this.reviewState = 'pending',
    required this.flagCategories,
    required this.flagCount,
    required this.votingStatus,
    this.votingProgress,
    required this.urgencyScore,
    required this.estimatedResolution,
    required this.hasUserVoted,
    this.userVote,
    required this.canUserVote,
    this.voteIneligibilityReason,
  });

  factory Appeal.fromJson(Map<String, dynamic> json) {
    final flagCategoriesValue = json['flagCategories'];
    final votingStatusValue = json['votingStatus'] as String?;
    final votingProgressValue = json['votingProgress'];
    return Appeal(
      appealId: json['appealId'] as String,
      contentId: json['contentId'] as String,
      contentType: json['contentType'] as String,
      contentTitle: json['contentTitle'] as String?,
      contentPreview: json['contentPreview'] as String? ?? '',
      appealType: json['appealType'] as String,
      appealReason: json['appealReason'] as String,
      userStatement: json['userStatement'] as String,
      submitterId: json['submitterId'] as String,
      submitterName: json['submitterName'] as String,
      submittedAt: DateTime.parse(json['submittedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      flagReason: json['flagReason'] as String,
      authorshipLabel: json['authorshipLabel'] as String? ?? 'Under review',
      classificationSource:
          json['classificationSource'] as String? ?? 'automated_classification',
      reviewState: json['reviewState'] as String? ?? 'pending',
      flagCategories: flagCategoriesValue is List
          ? List<String>.from(flagCategoriesValue)
          : const <String>[],
      flagCount: json['flagCount'] as int? ?? 0,
      votingStatus: VotingStatus.values.firstWhere(
        (e) => e.name == votingStatusValue,
        orElse: () => VotingStatus.active,
      ),
      votingProgress: votingProgressValue is Map
          ? VotingProgress.fromJson(
              Map<String, dynamic>.from(votingProgressValue),
            )
          : null,
      urgencyScore: json['urgencyScore'] as int? ?? 0,
      estimatedResolution: json['estimatedResolution'] as String? ?? 'Unknown',
      hasUserVoted: json['hasUserVoted'] as bool? ?? false,
      userVote: json['userVote'] as String?,
      canUserVote: json['canUserVote'] as bool? ?? false,
      voteIneligibilityReason: json['voteIneligibilityReason'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'appealId': appealId,
      'contentId': contentId,
      'contentType': contentType,
      'contentTitle': contentTitle,
      'contentPreview': contentPreview,
      'appealType': appealType,
      'appealReason': appealReason,
      'userStatement': userStatement,
      'submitterId': submitterId,
      'submitterName': submitterName,
      'submittedAt': submittedAt.toIso8601String(),
      'expiresAt': expiresAt.toIso8601String(),
      'flagReason': flagReason,
      'authorshipLabel': authorshipLabel,
      'classificationSource': classificationSource,
      'reviewState': reviewState,
      'flagCategories': flagCategories,
      'flagCount': flagCount,
      'votingStatus': votingStatus.name,
      'votingProgress': votingProgress?.toJson(),
      'urgencyScore': urgencyScore,
      'estimatedResolution': estimatedResolution,
      'hasUserVoted': hasUserVoted,
      'userVote': userVote,
      'canUserVote': canUserVote,
      'voteIneligibilityReason': voteIneligibilityReason,
    };
  }
}

/// Voting status enum
enum VotingStatus { active, quorumReached, timeExpired, resolved }

/// Extended voting progress with additional metadata
class VotingProgress {
  final int totalVotes;
  final int approveVotes;
  final int rejectVotes;
  final double approvalRate;
  final bool quorumMet;
  final String? timeRemaining;
  final String? estimatedResolution;
  final List<VoteBreakdown> voteBreakdown;

  const VotingProgress({
    required this.totalVotes,
    required this.approveVotes,
    required this.rejectVotes,
    required this.approvalRate,
    required this.quorumMet,
    this.timeRemaining,
    this.estimatedResolution,
    this.voteBreakdown = const [],
  });

  factory VotingProgress.fromJson(Map<String, dynamic> json) {
    final approvalRateValue = json['approvalRate'];
    final voteBreakdownValue = json['voteBreakdown'];
    return VotingProgress(
      totalVotes: json['totalVotes'] as int? ?? 0,
      approveVotes: json['approveVotes'] as int? ?? 0,
      rejectVotes: json['rejectVotes'] as int? ?? 0,
      approvalRate: approvalRateValue is num
          ? approvalRateValue.toDouble()
          : 0.0,
      quorumMet: json['quorumMet'] as bool? ?? false,
      timeRemaining: json['timeRemaining'] as String?,
      estimatedResolution: json['estimatedResolution'] as String?,
      voteBreakdown: voteBreakdownValue is List
          ? voteBreakdownValue
                .whereType<Map<String, dynamic>>()
                .map(
                  (e) => VoteBreakdown.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : const <VoteBreakdown>[],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'totalVotes': totalVotes,
      'approveVotes': approveVotes,
      'rejectVotes': rejectVotes,
      'approvalRate': approvalRate,
      'quorumMet': quorumMet,
      'timeRemaining': timeRemaining,
      'estimatedResolution': estimatedResolution,
      'voteBreakdown': voteBreakdown.map((e) => e.toJson()).toList(),
    };
  }
}

/// Vote breakdown by category or demographics
class VoteBreakdown {
  final String category;
  final int approveCount;
  final int rejectCount;
  final double percentage;

  const VoteBreakdown({
    required this.category,
    required this.approveCount,
    required this.rejectCount,
    required this.percentage,
  });

  factory VoteBreakdown.fromJson(Map<String, dynamic> json) {
    final percentageValue = json['percentage'];
    return VoteBreakdown(
      category: json['category'] as String,
      approveCount: json['approveCount'] as int? ?? 0,
      rejectCount: json['rejectCount'] as int? ?? 0,
      percentage: percentageValue is num ? percentageValue.toDouble() : 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'category': category,
      'approveCount': approveCount,
      'rejectCount': rejectCount,
      'percentage': percentage,
    };
  }
}

/// User vote record
class UserVote {
  final String voteId;
  final String appealId;
  final String userId;
  final String vote; // 'approve' or 'reject'
  final String? comment;
  final DateTime timestamp;
  final bool isValidated;

  const UserVote({
    required this.voteId,
    required this.appealId,
    required this.userId,
    required this.vote,
    this.comment,
    required this.timestamp,
    required this.isValidated,
  });

  factory UserVote.fromJson(Map<String, dynamic> json) {
    return UserVote(
      voteId: json['voteId'] as String,
      appealId: json['appealId'] as String,
      userId: json['userId'] as String,
      vote: json['vote'] as String,
      comment: json['comment'] as String?,
      timestamp: DateTime.parse(json['timestamp'] as String),
      isValidated: json['isValidated'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'voteId': voteId,
      'appealId': appealId,
      'userId': userId,
      'vote': vote,
      'comment': comment,
      'timestamp': timestamp.toIso8601String(),
      'isValidated': isValidated,
    };
  }
}

/// Appeal response wrapper
class AppealResponse {
  final List<Appeal> appeals;
  final AppealPagination pagination;
  final AppealFilters filters;
  final AppealSummary summary;

  const AppealResponse({
    required this.appeals,
    required this.pagination,
    required this.filters,
    required this.summary,
  });

  factory AppealResponse.fromJson(Map<String, dynamic> json) {
    final appealsValue = json['appeals'];
    final paginationValue = json['pagination'];
    final filtersValue = json['filters'];
    final summaryValue = json['summary'];
    return AppealResponse(
      appeals: appealsValue is List
          ? appealsValue
                .whereType<Map<String, dynamic>>()
                .map((e) => Appeal.fromJson(Map<String, dynamic>.from(e)))
                .toList()
          : const <Appeal>[],
      pagination: AppealPagination.fromJson(
        paginationValue is Map
            ? Map<String, dynamic>.from(paginationValue)
            : const <String, dynamic>{},
      ),
      filters: AppealFilters.fromJson(
        filtersValue is Map
            ? Map<String, dynamic>.from(filtersValue)
            : const <String, dynamic>{},
      ),
      summary: AppealSummary.fromJson(
        summaryValue is Map
            ? Map<String, dynamic>.from(summaryValue)
            : const <String, dynamic>{},
      ),
    );
  }
}

/// Pagination info
class AppealPagination {
  final int total;
  final int page;
  final int pageSize;
  final bool hasMore;
  final int totalPages;

  const AppealPagination({
    required this.total,
    required this.page,
    required this.pageSize,
    required this.hasMore,
    required this.totalPages,
  });

  factory AppealPagination.fromJson(Map<String, dynamic> json) {
    return AppealPagination(
      total: json['total'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      pageSize: json['pageSize'] as int? ?? 20,
      hasMore: json['hasMore'] as bool? ?? false,
      totalPages: json['totalPages'] as int? ?? 1,
    );
  }
}

/// Filter options
class AppealFilters {
  final String? contentType;
  final String? urgency;
  final String? category;
  final String sortBy;
  final String sortOrder;

  const AppealFilters({
    this.contentType,
    this.urgency,
    this.category,
    this.sortBy = 'urgency',
    this.sortOrder = 'desc',
  });

  factory AppealFilters.fromJson(Map<String, dynamic> json) {
    return AppealFilters(
      contentType: json['contentType'] as String?,
      urgency: json['urgency'] as String?,
      category: json['category'] as String?,
      sortBy: json['sortBy'] as String? ?? 'urgency',
      sortOrder: json['sortOrder'] as String? ?? 'desc',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (contentType != null) 'contentType': contentType,
      if (urgency != null) 'urgency': urgency,
      if (category != null) 'category': category,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
    };
  }
}

/// Summary statistics
class AppealSummary {
  final int totalActive;
  final int totalVotes;
  final int userVotes;
  final double averageResolutionTime;
  final Map<String, int> categoryBreakdown;

  const AppealSummary({
    required this.totalActive,
    required this.totalVotes,
    required this.userVotes,
    required this.averageResolutionTime,
    required this.categoryBreakdown,
  });

  factory AppealSummary.fromJson(Map<String, dynamic> json) {
    final avgResolutionValue = json['averageResolutionTime'];
    final breakdownValue = json['categoryBreakdown'];
    return AppealSummary(
      totalActive: json['totalActive'] as int? ?? 0,
      totalVotes: json['totalVotes'] as int? ?? 0,
      userVotes: json['userVotes'] as int? ?? 0,
      averageResolutionTime: avgResolutionValue is num
          ? avgResolutionValue.toDouble()
          : 0.0,
      categoryBreakdown: breakdownValue is Map
          ? Map<String, int>.from(breakdownValue)
          : const <String, int>{},
    );
  }
}

/// Vote result wrapper
class VoteResult {
  final bool success;
  final String? message;
  final bool tallyTriggered;
  final VotingProgress? updatedProgress;

  const VoteResult({
    required this.success,
    this.message,
    required this.tallyTriggered,
    this.updatedProgress,
  });

  factory VoteResult.fromJson(Map<String, dynamic> json) {
    final updatedProgressValue = json['updatedProgress'];
    return VoteResult(
      success: json['success'] as bool? ?? false,
      message: json['message'] as String?,
      tallyTriggered: json['tallyTriggered'] as bool? ?? false,
      updatedProgress: updatedProgressValue is Map
          ? VotingProgress.fromJson(
              Map<String, dynamic>.from(updatedProgressValue),
            )
          : null,
    );
  }
}

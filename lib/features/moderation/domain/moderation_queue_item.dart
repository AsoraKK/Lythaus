// ignore_for_file: public_member_api_docs

/// Domain models for moderation review queue items
library;

enum ModerationItemType { flag, appeal }

enum ModerationSeverityLevel { low, medium, high, unknown }

class ModerationQueueItem {
  const ModerationQueueItem({
    required this.id,
    required this.type,
    required this.contentId,
    required this.contentType,
    required this.contentPreview,
    required this.createdAt,
    required this.severity,
    required this.status,
    required this.queue,
    required this.reportCount,
    required this.reviewerDecisions,
    required this.isEscalated,
    this.contentTitle,
    this.authorHandle,
    this.thumbnailUrl,
    this.aiRiskBand,
    this.aiSignal,
    this.tier,
    this.isPolicyTest = false,
  });

  final String id;
  final ModerationItemType type;
  final String contentId;
  final String contentType;
  final String contentPreview;
  final DateTime createdAt;
  final ModerationSeverityLevel severity;
  final String status;
  final String queue;
  final int reportCount;
  final int reviewerDecisions;
  final bool isEscalated;
  final String? contentTitle;
  final String? authorHandle;
  final String? thumbnailUrl;
  final String? aiRiskBand;
  final String? aiSignal;
  final String? tier;
  final bool isPolicyTest;

  bool get hasHighSeverity => severity == ModerationSeverityLevel.high;

  factory ModerationQueueItem.fromJson(Map<String, dynamic> json) {
    final createdAtValue =
        json['createdAt'] as String? ?? json['created_at'] as String? ?? '';
    DateTime parsedCreatedAt;
    try {
      parsedCreatedAt = DateTime.parse(createdAtValue);
    } catch (_) {
      parsedCreatedAt = DateTime.now();
    }

    return ModerationQueueItem(
      id: json['id']?.toString() ?? json['caseId']?.toString() ?? '',
      type: parseItemType(json['type']?.toString()),
      contentId: json['contentId']?.toString() ?? '',
      contentType: json['contentType']?.toString() ?? 'unknown',
      contentPreview:
          json['contentPreview']?.toString() ??
          json['snippet']?.toString() ??
          '',
      contentTitle: json['contentTitle']?.toString(),
      authorHandle: json['authorHandle']?.toString(),
      createdAt: parsedCreatedAt,
      severity: parseSeverity(json['severity']?.toString()),
      status: json['status']?.toString() ?? 'unknown',
      queue: json['queue']?.toString() ?? 'default',
      reportCount:
          (json['reportCount'] as int?) ??
          (json['flags'] as int?) ??
          (json['reports'] as int?) ??
          0,
      reviewerDecisions: _readReviewerDecisions(json),
      isEscalated: json['isEscalated'] == true || json['escalated'] == true,
      thumbnailUrl: json['thumbnailUrl']?.toString(),
      aiRiskBand: json['aiRiskBand']?.toString() ?? json['aiLabel']?.toString(),
      aiSignal: json['aiSignal']?.toString(),
      tier:
          json['tier']?.toString() ??
          json['authorTier']?.toString() ??
          json['userTier']?.toString(),
      isPolicyTest: json['isPolicyTest'] == true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type.name,
      'contentId': contentId,
      'contentType': contentType,
      'contentPreview': contentPreview,
      'createdAt': createdAt.toIso8601String(),
      'severity': severity.name,
      'status': status,
      'queue': queue,
      'reportCount': reportCount,
      'reviewerDecisions': reviewerDecisions,
      'isEscalated': isEscalated,
      'contentTitle': contentTitle,
      'authorHandle': authorHandle,
      'thumbnailUrl': thumbnailUrl,
      'aiRiskBand': aiRiskBand,
      'aiSignal': aiSignal,
      'tier': tier,
      'isPolicyTest': isPolicyTest,
    };
  }

  static ModerationItemType parseItemType(String? value) {
    switch (value?.toLowerCase()) {
      case 'appeal':
        return ModerationItemType.appeal;
      case 'flag':
      default:
        return ModerationItemType.flag;
    }
  }

  static int _readReviewerDecisions(Map<String, dynamic> json) {
    final reviewerPanel = json['reviewerPanel'];
    final panelCount = reviewerPanel is Map
        ? reviewerPanel['completedReviewers'] ??
              reviewerPanel['reviewerDecisions'] ??
              reviewerPanel['decisionCount']
        : null;

    if (panelCount is int) return panelCount;

    return (json['reviewerDecisions'] as int?) ??
        (json['reviewer_decisions'] as int?) ??
        (json['completedReviewers'] as int?) ??
        // Historical queue snapshots used these fields before reviewer panels.
        (json['communityVotes'] as int?) ??
        0;
  }

  static ModerationSeverityLevel parseSeverity(String? value) {
    switch (value?.toLowerCase()) {
      case 'high':
        return ModerationSeverityLevel.high;
      case 'medium':
        return ModerationSeverityLevel.medium;
      case 'low':
        return ModerationSeverityLevel.low;
      default:
        return ModerationSeverityLevel.unknown;
    }
  }
}

class ModerationQueuePagination {
  const ModerationQueuePagination({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.hasMore,
  });

  final int page;
  final int pageSize;
  final int total;
  final bool hasMore;

  factory ModerationQueuePagination.fromJson(Map<String, dynamic>? json) {
    return ModerationQueuePagination(
      page: (json?['page'] as int?) ?? 1,
      pageSize: (json?['pageSize'] as int?) ?? 20,
      total: (json?['total'] as int?) ?? 0,
      hasMore: (json?['hasMore'] as bool?) ?? false,
    );
  }
}

class ModerationQueueResponse {
  const ModerationQueueResponse({
    required this.items,
    required this.pagination,
  });

  final List<ModerationQueueItem> items;
  final ModerationQueuePagination pagination;

  factory ModerationQueueResponse.fromJson(Map<String, dynamic> json) {
    final data = json['items'] as List? ?? json['data'] as List? ?? [];
    final pagination = ModerationQueuePagination.fromJson(
      json['pagination'] as Map<String, dynamic>?,
    );
    return ModerationQueueResponse(
      items: data
          .map(
            (item) =>
                ModerationQueueItem.fromJson(item as Map<String, dynamic>),
          )
          .toList(),
      pagination: pagination,
    );
  }
}

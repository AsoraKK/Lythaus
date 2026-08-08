// ignore_for_file: public_member_api_docs

/// LYTHAUS POST INSIGHTS DOMAIN MODEL
///
/// 🎯 Purpose: Domain models for post insights (author-only view)
/// 🏗️ Architecture: Domain layer - pure data classes
/// 🔐 Privacy: Only sanitized data, no raw scores/thresholds
/// 📱 Platform: Flutter
library;

/// Risk band for moderation decision - derived from decision + appeal status
///
/// Mapping:
///   - LOW: Content is allowed/published
///   - MEDIUM: Content is blocked with a pending appeal
///   - HIGH: Content is blocked with no pending appeal
enum RiskBand {
  low,
  medium,
  high;

  String get displayLabel {
    switch (this) {
      case RiskBand.low:
        return 'Low';
      case RiskBand.medium:
        return 'Appeal pending';
      case RiskBand.high:
        return 'High';
    }
  }

  static RiskBand fromString(String value) {
    switch (value.toUpperCase()) {
      case 'LOW':
        return RiskBand.low;
      case 'MEDIUM':
        return RiskBand.medium;
      case 'HIGH':
        return RiskBand.high;
      default:
        return RiskBand.medium;
    }
  }
}

/// Binary moderation decision - ALLOW or BLOCK only
///
/// Product model: Posts are either Published (ALLOW) or Blocked (BLOCK).
/// Internal QUEUE decisions are collapsed to BLOCK by the backend.
enum InsightDecision {
  allow,
  block;

  String get displayLabel {
    switch (this) {
      case InsightDecision.allow:
        return 'Published';
      case InsightDecision.block:
        return 'Blocked';
    }
  }

  static InsightDecision fromString(String value) {
    switch (value.toUpperCase()) {
      case 'ALLOW':
        return InsightDecision.allow;
      case 'BLOCK':
        return InsightDecision.block;
      default:
        // Unknown values default to BLOCK (safe)
        return InsightDecision.block;
    }
  }
}

/// Appeal status for insights
enum InsightAppealStatus {
  none,
  pending,
  approved,
  rejected;

  String get displayLabel {
    switch (this) {
      case InsightAppealStatus.none:
        return 'None';
      case InsightAppealStatus.pending:
        return 'Pending';
      case InsightAppealStatus.approved:
        return 'Approved';
      case InsightAppealStatus.rejected:
        return 'Rejected';
    }
  }

  static InsightAppealStatus fromString(String value) {
    switch (value.toUpperCase()) {
      case 'NONE':
        return InsightAppealStatus.none;
      case 'PENDING':
        return InsightAppealStatus.pending;
      case 'APPROVED':
        return InsightAppealStatus.approved;
      case 'REJECTED':
        return InsightAppealStatus.rejected;
      default:
        return InsightAppealStatus.none;
    }
  }
}

/// Appeal information for insights
class InsightAppeal {
  final InsightAppealStatus status;
  final DateTime? updatedAt;

  const InsightAppeal({required this.status, this.updatedAt});

  factory InsightAppeal.fromJson(Map<String, dynamic> json) {
    return InsightAppeal(
      status: InsightAppealStatus.fromString(
        json['status'] as String? ?? 'NONE',
      ),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'status': status.name.toUpperCase(),
    if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
  };
}

/// Post insights - sanitized moderation data for authors/admins
///
/// Privacy: This model intentionally excludes:
/// - Raw scores / probabilities
/// - Threshold numeric values
/// - Detailed category scores
/// - Provider-specific metadata
class PostInsights {
  final String postId;
  final RiskBand riskBand;
  final InsightDecision decision;
  final List<String> reasonCodes;
  final int configVersion;
  final DateTime decidedAt;
  final InsightAppeal appeal;

  const PostInsights({
    required this.postId,
    required this.riskBand,
    required this.decision,
    required this.reasonCodes,
    required this.configVersion,
    required this.decidedAt,
    required this.appeal,
  });

  factory PostInsights.fromJson(Map<String, dynamic> json) {
    return PostInsights(
      postId: json['postId'] as String,
      riskBand: RiskBand.fromString(json['riskBand'] as String? ?? 'MEDIUM'),
      decision: InsightDecision.fromString(
        json['decision'] as String? ?? 'BLOCK',
      ),
      reasonCodes:
          (json['reasonCodes'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      configVersion: json['configVersion'] as int? ?? 0,
      decidedAt: DateTime.parse(
        json['decidedAt'] as String? ?? DateTime.now().toIso8601String(),
      ),
      appeal: json['appeal'] != null
          ? InsightAppeal.fromJson(json['appeal'] as Map<String, dynamic>)
          : const InsightAppeal(status: InsightAppealStatus.none),
    );
  }

  Map<String, dynamic> toJson() => {
    'postId': postId,
    'riskBand': riskBand.name.toUpperCase(),
    'decision': decision.name.toUpperCase(),
    'reasonCodes': reasonCodes,
    'configVersion': configVersion,
    'decidedAt': decidedAt.toIso8601String(),
    'appeal': appeal.toJson(),
  };
}

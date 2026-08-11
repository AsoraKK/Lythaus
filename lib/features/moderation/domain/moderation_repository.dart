// ignore_for_file: public_member_api_docs

/// LYTHAUS MODERATION REPOSITORY
///
/// 🎯 Purpose: Abstract interface for moderation operations
/// 🏗️ Architecture: Domain layer - defines business contracts
/// 🔐 Dependency Rule: Application layer implements this interface
/// 📱 Platform: Flutter with Clean Architecture compliance
library;

import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';

/// Abstract repository defining moderation domain operations
///
/// This interface follows the Dependency Inversion Principle:
/// - Domain layer defines WHAT operations are needed
/// - Application layer implements HOW they work
/// - UI layer uses providers that depend on this interface
abstract class ModerationRepository {
  /// Flag content for moderation review
  ///
  /// [contentId] - ID of the content to flag
  /// [contentType] - Type of content ('post', 'comment', 'user')
  /// [reason] - Reason for flagging
  /// [additionalDetails] - Optional additional context
  /// [token] - User authentication token
  ///
  /// Returns success status and any relevant metadata
  /// Throws [ModerationException] on failure
  Future<Map<String, dynamic>> flagContent({
    required String contentId,
    required String contentType,
    required String reason,
    String? additionalDetails,
    required String token,
  });

  /// Fetch the moderation review queue (flags + appeals).
  Future<ModerationQueueResponse> fetchModerationQueue({
    int page = 1,
    int pageSize = 20,
    ModerationFilters? filters,
    required String token,
  });

  /// Load a single moderation case for review.
  Future<ModerationCase> fetchModerationCase({
    required String caseId,
    required String token,
  });

  /// Submit a moderator decision.
  Future<ModerationDecisionResult> submitModerationDecision({
    required String caseId,
    required String token,
    required ModerationDecisionInput input,
  });

  /// Escalate a case to a different queue.
  Future<void> escalateModerationCase({
    required String caseId,
    required String token,
    required ModerationEscalationInput input,
  });

  /// Fetch the audit trail tied to a case.
  Future<ModerationAuditResponse> fetchCaseAudit({
    required String caseId,
    required String token,
  });

  /// Global audit search with filters.
  Future<ModerationAuditResponse> searchAudit({
    required ModerationAuditSearchFilters filters,
    required String token,
  });
}

/// Domain exception for moderation operations
class ModerationException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;
  final Duration? retryAfter;
  final Map<String, dynamic>? payload;
  final dynamic originalError;

  const ModerationException(
    this.message, {
    this.code,
    this.statusCode,
    this.retryAfter,
    this.payload,
    this.originalError,
  });

  @override
  String toString() => 'ModerationException: $message';
}

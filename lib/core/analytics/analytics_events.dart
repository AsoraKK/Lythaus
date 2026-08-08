// ignore_for_file: public_member_api_docs

/// LYTHAUS ANALYTICS EVENT NAMES
///
/// 🎯 Purpose: Centralized analytics event catalog
/// 🔐 Privacy: All events are PII-free, categorical/numeric properties only
/// 📊 Convention: snake_case names, minimal property sets
library;

/// Analytics event names and property schemas.
///
/// Guidelines:
/// - Event names: snake_case, concise, action-oriented
/// - Properties: categorical (string enums), numeric, or boolean only
/// - NO free-text fields that might contain PII
/// - NO content snippets, usernames, emails, etc.
class AnalyticsEvents {
  AnalyticsEvents._(); // Private constructor - static class

  // ===== Lifecycle & Navigation =====

  /// App launched or returned to foreground
  static const String appStarted = 'app_started';

  /// User viewed a screen
  ///
  /// Properties:
  /// - screen_name: string (feed, profile, privacy_settings, moderation_queue, etc.)
  /// - referrer: string? (previous screen name or entry point)
  static const String screenView = 'screen_view';

  // ===== Authentication =====

  /// User initiated sign-in flow
  ///
  /// Properties:
  /// - method: string (email, guest)
  static const String authStarted = 'auth_started';

  /// User selected an auth path from entry screen.
  ///
  /// Properties:
  /// - method: string (guest, sign_in, create_account)
  static const String authChoiceSelected = 'auth_choice_selected';

  /// User completed sign-in successfully
  ///
  /// Properties:
  /// - method: string (email, guest)
  /// - is_new_user: bool
  static const String authCompleted = 'auth_completed';

  /// User signed out
  static const String authSignedOut = 'auth_signed_out';

  // ===== Onboarding Funnel =====

  /// First launch after install
  static const String onboardingStart = 'onboarding_start';

  /// Invite entry screen viewed
  static const String inviteScreenView = 'invite_screen_view';

  /// Invite redeemed successfully
  static const String inviteRedeemSuccess = 'invite_redeem_success';

  /// Invite redemption failed
  ///
  /// Properties:
  /// - reason: string (InviteRedeemFailureReason.value)
  static const String inviteRedeemFail = 'invite_redeem_fail';

  /// Profile completion confirmed (required fields saved)
  static const String profileComplete = 'profile_complete';

  /// First follow action completed
  static const String firstFollow = 'first_follow';

  /// First post published successfully
  static const String firstPost = 'first_post';

  // ===== Content Creation =====

  /// User created a post
  ///
  /// Properties:
  /// - media_type: string (text, image, video)
  /// - ai_blocked: bool (whether AI moderation blocked or flagged)
  /// - is_first_post: bool
  static const String postCreated = 'post_created';

  /// User attempted to submit their first post.
  static const String firstPostAttempt = 'first_post_attempt';

  /// User created a comment
  ///
  /// Properties:
  /// - ai_blocked: bool
  static const String commentCreated = 'comment_created';

  // ===== Engagement =====

  /// User scrolled through feed
  ///
  /// Properties:
  /// - approx_items_viewed: int (count of items scrolled past)
  /// - session_duration_seconds: int
  static const String feedScrolled = 'feed_scrolled';

  /// First successful feed payload rendered for current user/session.
  static const String feedFirstLoad = 'feed_first_load';

  /// User interacted with a post (like, share, etc.)
  ///
  /// Properties:
  /// - action: string (like, unlike, share, report)
  static const String postInteraction = 'post_interaction';

  // ===== Privacy & Settings =====

  /// User opened privacy settings screen
  static const String privacySettingsOpened = 'privacy_settings_opened';

  /// User requested data export
  static const String privacyExportRequested = 'privacy_export_requested';

  /// User initiated account deletion
  static const String privacyDeleteRequested = 'privacy_delete_requested';

  /// User changed analytics consent
  ///
  /// Properties:
  /// - enabled: bool
  /// - source: string (onboarding, privacy_settings)
  static const String analyticsConsentChanged = 'analytics_consent_changed';

  // ===== Moderation =====

  /// User submitted a moderation appeal
  ///
  /// Properties:
  /// - appeal_type: string (content_removal, account_suspension, content_flagged)
  /// - urgency_score: int (0-100, for appeal submitter visibility only)
  static const String moderationAppealSubmitted = 'moderation_appeal_submitted';

  /// Moderator viewed moderation console
  static const String moderationConsoleOpened = 'moderation_console_opened';

  /// Moderator made a moderation decision
  ///
  /// Properties:
  /// - action: string (approve, reject, escalate, request_info)
  /// - case_type: string (post, comment, report, appeal)
  static const String moderationDecisionMade = 'moderation_decision_made';

  // ===== Errors & Issues =====

  /// User encountered an error
  ///
  /// Properties:
  /// - error_type: string (network, auth, validation, unknown)
  /// - screen_name: string
  /// - recoverable: bool
  static const String errorEncountered = 'error_encountered';

  // ===== Social Actions =====

  /// User followed or unfollowed another user
  ///
  /// Properties:
  /// - action: string (follow, unfollow)
  static const String socialFollowToggle = 'social_follow_toggle';

  /// User shared content
  ///
  /// Properties:
  /// - method: string (clipboard, external)
  /// - content_type: string (post, profile)
  static const String contentShared = 'content_shared';

  /// User opened or changed notification preferences
  static const String notificationPrefsChanged = 'notification_prefs_changed';

  /// User edited their profile
  ///
  /// Properties:
  /// - fields_changed: int (number of fields updated)
  static const String profileEdited = 'profile_edited';

  /// User completed a search
  ///
  /// Properties:
  /// - result_count: int
  static const String searchPerformed = 'search_performed';

  /// Deep link was triggered
  ///
  /// Properties:
  /// - type: string (post, profile, invite, settings)
  static const String deepLinkNavigated = 'deep_link_navigated';

  // ===== Property Keys (for consistency) =====

  static const String propScreenName = 'screen_name';
  static const String propReferrer = 'referrer';
  static const String propMethod = 'method';
  static const String propIsNewUser = 'is_new_user';
  static const String propMediaType = 'media_type';
  static const String propAiBlocked = 'ai_blocked';
  static const String propIsFirstPost = 'is_first_post';
  static const String propApproxItemsViewed = 'approx_items_viewed';
  static const String propSessionDurationSeconds = 'session_duration_seconds';
  static const String propAction = 'action';
  static const String propEnabled = 'enabled';
  static const String propSource = 'source';
  static const String propAppealType = 'appeal_type';
  static const String propUrgencyScore = 'urgency_score';
  static const String propCaseType = 'case_type';
  static const String propErrorType = 'error_type';
  static const String propRecoverable = 'recoverable';
  static const String propInviteRedeemReason = 'reason';
}

enum InviteRedeemFailureReason {
  invalidCode,
  expired,
  alreadyUsed,
  exhausted,
  revoked,
  emailMismatch,
  alreadyActive,
  missingEmail,
  invalidRequest,
  unauthorized,
  rateLimited,
  network,
  unknown,
}

extension InviteRedeemFailureReasonX on InviteRedeemFailureReason {
  String get value {
    switch (this) {
      case InviteRedeemFailureReason.invalidCode:
        return 'invalid_code';
      case InviteRedeemFailureReason.expired:
        return 'expired';
      case InviteRedeemFailureReason.alreadyUsed:
        return 'already_used';
      case InviteRedeemFailureReason.exhausted:
        return 'exhausted';
      case InviteRedeemFailureReason.revoked:
        return 'revoked';
      case InviteRedeemFailureReason.emailMismatch:
        return 'email_mismatch';
      case InviteRedeemFailureReason.alreadyActive:
        return 'already_active';
      case InviteRedeemFailureReason.missingEmail:
        return 'missing_email';
      case InviteRedeemFailureReason.invalidRequest:
        return 'invalid_request';
      case InviteRedeemFailureReason.unauthorized:
        return 'unauthorized';
      case InviteRedeemFailureReason.rateLimited:
        return 'rate_limited';
      case InviteRedeemFailureReason.network:
        return 'network';
      case InviteRedeemFailureReason.unknown:
        return 'unknown';
    }
  }
}

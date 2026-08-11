// ignore_for_file: public_member_api_docs

/// LYTHAUS ERROR CODES
///
/// 🎯 Purpose: Centralized error codes for consistent API/UI error handling
/// 🔐 Security: Error codes do not expose implementation details
/// 📱 UX: Maps to user-friendly messages without technical leakage
library;

/// Stable error codes for client error handling.
///
/// These codes are returned by the API and should be used for
/// programmatic error handling in the client.
abstract final class ErrorCodes {
  // ─────────────────────────────────────────────────────────────────────────
  // DEVICE INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────

  /// Write operation blocked due to device integrity check failure.
  /// User message: "Posting is disabled on this device for security reasons."
  static const String deviceIntegrityBlocked = 'DEVICE_INTEGRITY_BLOCKED';

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────────────

  /// User is not authenticated (no token or invalid token).
  static const String authRequired = 'AUTH_REQUIRED';

  /// Token has expired and needs refresh.
  static const String tokenExpired = 'TOKEN_EXPIRED';

  // ─────────────────────────────────────────────────────────────────────────
  // RATE LIMITING
  // ─────────────────────────────────────────────────────────────────────────

  /// Daily limit exceeded for an action (posts, appeals, etc.).
  static const String dailyLimitExceeded = 'DAILY_LIMIT_EXCEEDED';

  /// Daily appeal limit exceeded.
  static const String dailyAppealLimitExceeded = 'DAILY_APPEAL_LIMIT_EXCEEDED';

  // ─────────────────────────────────────────────────────────────────────────
  // MODERATION
  // ─────────────────────────────────────────────────────────────────────────

  /// Content was blocked by AI moderation.
  static const String contentBlocked = 'CONTENT_BLOCKED';

  /// AI-generated content violates a prohibited-content rule.
  static const String aiContentBlocked = 'AI_CONTENT_BLOCKED';

  /// An authorship disclosure is required.
  static const String aiLabelRequired = 'AI_LABEL_REQUIRED';

  /// Appeal already exists for this content.
  static const String appealExists = 'APPEAL_EXISTS';

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  /// Request validation failed (missing fields, invalid format).
  static const String validationFailed = 'VALIDATION_FAILED';

  /// Resource not found.
  static const String notFound = 'NOT_FOUND';
}

/// User-friendly messages for error codes.
///
/// These messages are safe to display to users and do not expose
/// technical implementation details.
abstract final class ErrorMessages {
  static const Map<String, String> _messages = {
    ErrorCodes.deviceIntegrityBlocked:
        'Posting is disabled on this device for security reasons.\n\n'
        'You can still browse content normally.',
    ErrorCodes.authRequired: 'Please sign in to continue.',
    ErrorCodes.tokenExpired: 'Your session has expired. Please sign in again.',
    ErrorCodes.dailyLimitExceeded:
        'You have reached your daily limit. Please try again tomorrow.',
    ErrorCodes.dailyAppealLimitExceeded:
        'You have reached your daily appeal limit. Please try again tomorrow.',
    ErrorCodes.contentBlocked:
        'This content cannot be posted as it may violate our community guidelines.',
    ErrorCodes.aiContentBlocked:
        'AI-generated public content cannot be posted.',
    ErrorCodes.aiLabelRequired:
        'Choose Human-authored or AI-assisted before posting.',
    ErrorCodes.appealExists:
        'You have already submitted an appeal for this content.',
    ErrorCodes.validationFailed: 'Please check your input and try again.',
    ErrorCodes.notFound: 'The requested content could not be found.',
  };

  /// Get user-friendly message for an error code.
  static String forCode(String? code) {
    if (code == null) return 'Something went wrong. Please try again.';
    return _messages[code] ?? 'Something went wrong. Please try again.';
  }
}

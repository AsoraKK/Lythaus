/// Input bounds only: never changes a stored password's interpretation.
abstract final class PasswordPolicy {
  /// Minimum code points when creating or replacing a credential.
  static const newPasswordMin = 15;

  /// Login validates input bounds, not the creation policy.
  static const loginPasswordMin = 1;

  /// Maximum supported code points without truncation.
  static const passwordMax = 128;

  /// Whether an existing password can be submitted for verification.
  static bool acceptsLogin(String value) => _accepts(value, loginPasswordMin);

  /// Whether a new password meets length bounds (not breach screening).
  static bool acceptsNew(String value) => _accepts(value, newPasswordMin);

  static bool _accepts(String value, int minimum) {
    if (value.length > passwordMax * 2) return false;
    final length = value.runes.length;
    return length >= minimum && length <= passwordMax;
  }
}

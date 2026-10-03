/// A protected read needs a valid member session.
class AuthRequiredException implements Exception {
  /// Creates an authentication-required result without disclosing account data.
  const AuthRequiredException();

  @override
  String toString() => 'Sign in to continue.';
}

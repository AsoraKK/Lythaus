/// Returns the safe browser location for an invite route without its secret.
///
/// Invitation codes may arrive in the fragment or in the legacy path format.
/// Replacing either with the stable route prevents the one-time code from
/// remaining in browser history after the app has captured it.
String inviteLocationWithoutCode(Uri location) {
  if (location.path == '/invite' || location.path.startsWith('/invite/')) {
    return '/invite';
  }
  return location.toString();
}

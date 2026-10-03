/// Validates a return destination inside this application.
String safeAuthReturn(String? location) {
  if (location == null || RegExp(r'[\x00-\x20\\]').hasMatch(location)) {
    return '/';
  }
  final uri = Uri.tryParse(location);
  if (uri == null ||
      uri.hasScheme ||
      uri.hasAuthority ||
      uri.hasFragment ||
      !uri.path.startsWith('/') ||
      uri.path.startsWith('//') ||
      uri.path.contains('\\') ||
      uri.path == '/login' ||
      uri.path == '/profile/setup') {
    return '/';
  }
  String decodedPath;
  try {
    decodedPath = Uri.decodeComponent(uri.path);
  } on FormatException {
    return '/';
  }
  if (decodedPath.startsWith('//') ||
      RegExp(r'[\x00-\x20\\]').hasMatch(decodedPath) ||
      decodedPath == '/login' ||
      decodedPath == '/profile/setup') {
    return '/';
  }
  return uri.toString();
}

/// Uses an explicit return query so a guest can reopen account entry.
String signInLocation(String returnTo, {bool accountEntry = false}) => Uri(
  path: '/login',
  queryParameters: {
    'returnTo': safeAuthReturn(returnTo),
    if (accountEntry) 'entry': '1',
  },
).toString();

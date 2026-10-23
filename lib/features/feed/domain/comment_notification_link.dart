/// Accepts a comment destination only when it matches the notification entity.
String? commentNotificationLink(Map<String, dynamic> notification) {
  if (!const {
    'reply',
    'content.reply_received',
    'content.comment_received',
  }.contains(notification['notificationType'])) {
    return null;
  }
  final value = notification['deeplink'];
  if (value is! String) return null;
  final uri = Uri.tryParse(value);
  if (uri == null || uri.hasScheme || uri.hasAuthority || uri.hasFragment) {
    return null;
  }
  final id = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );
  if (uri.pathSegments.length != 2 ||
      !uri.path.startsWith('/post/') ||
      uri.pathSegments.first != 'post' ||
      !id.hasMatch(uri.pathSegments.last) ||
      uri.queryParameters.length != 1 ||
      uri.queryParametersAll['commentId']?.length != 1 ||
      uri.queryParameters['commentId'] != notification['entityId'] ||
      !id.hasMatch(uri.queryParameters['commentId'] ?? '')) {
    return null;
  }
  return value;
}

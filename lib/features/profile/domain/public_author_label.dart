/// A public member label must never fall back to an internal identifier.
String publicAuthorLabel(
  String? displayName, {
  String? handle,
  String? authorId,
}) {
  final identifier = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );
  for (final candidate in [displayName, handle]) {
    final value = candidate?.trim() ?? '';
    if (value.isEmpty || value == authorId || identifier.hasMatch(value)) {
      continue;
    }
    return candidate == handle && candidate != displayName
        ? '@${value.replaceFirst(RegExp(r'^@'), '')}'
        : value;
  }
  return 'Lythaus member';
}

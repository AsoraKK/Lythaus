import 'package:uuid/uuid.dart';

/// Generates client replay keys without using them as record identifiers.
abstract final class IdempotencyKey {
  static const Uuid _uuid = Uuid();

  /// Creates a caller-owned replay key scoped to one mutation family.
  static String create(String scope) => '$scope-${_uuid.v4()}';
}

import 'package:lythaus/features/feed/application/content_recovery_storage.dart';

class MemoryContentRecoveryStorage implements ContentRecoveryStorage {
  final values = <String, String>{};
  bool failReads = false;
  bool failWrites = false;
  @override
  Future<String?> read(String key) async {
    if (failReads) throw StateError('Synthetic storage failure');
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    if (failWrites) throw StateError('Synthetic storage failure');
    values[key] = value;
  }
}

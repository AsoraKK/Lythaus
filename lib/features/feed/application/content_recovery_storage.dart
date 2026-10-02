// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class ContentRecoveryStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecureContentRecoveryStorage implements ContentRecoveryStorage {
  const SecureContentRecoveryStorage();
  static const _storage = FlutterSecureStorage(
    webOptions: WebOptions(
      dbName: 'LythausContentRecovery',
      publicKey: 'LythausContentRecovery',
    ),
  );

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
}

final contentRecoveryStorageProvider = Provider<ContentRecoveryStorage>(
  (_) => const SecureContentRecoveryStorage(),
);

// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

abstract interface class DeviceUnlockPreferencesStore {
  Future<DeviceUnlockPreference> load(String accountId);
  Future<void> save(String accountId, DeviceUnlockPreference preference);
}

class SecureDeviceUnlockPreferencesStore
    implements DeviceUnlockPreferencesStore {
  const SecureDeviceUnlockPreferencesStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.unlocked_this_device,
      ),
      mOptions: MacOsOptions(
        accessibility: KeychainAccessibility.unlocked_this_device,
      ),
    ),
  }) : _storage = storage;

  final FlutterSecureStorage _storage;
  static final _operations = <String, Future<void>>{};

  static Future<T> _serialize<T>(String key, Future<T> Function() operation) {
    final result = (_operations[key] ?? Future<void>.value()).then(
      (_) => operation(),
    );
    final settled = result.then<void>((_) {}, onError: (Object _) {});
    _operations[key] = settled;
    unawaited(
      settled.then((_) {
        if (identical(_operations[key], settled)) _operations.remove(key);
      }),
    );
    return result;
  }

  static String keyForAccount(String accountId) {
    if (accountId.trim().isEmpty) throw ArgumentError('An account is required');
    return 'lythaus.member_unlock.draft.v1.${sha256.convert(utf8.encode(accountId))}';
  }

  @override
  Future<DeviceUnlockPreference> load(String accountId) async {
    final key = keyForAccount(accountId);
    return _serialize(key, () async {
      final value = await _storage.read(key: key);
      if (value == null) return DeviceUnlockPreference.off;
      final decoded = jsonDecode(value);
      if (decoded is! Map<String, dynamic> ||
          decoded['version'] != 1 ||
          decoded['preference'] is! String) {
        throw const FormatException('Invalid draft unlock preference');
      }
      return DeviceUnlockPreference.parse(decoded['preference'] as String);
    });
  }

  @override
  Future<void> save(String accountId, DeviceUnlockPreference preference) {
    final key = keyForAccount(accountId);
    return _serialize(
      key,
      () => _storage.write(
        key: key,
        value: jsonEncode({'version': 1, 'preference': preference.value}),
      ),
    );
  }
}

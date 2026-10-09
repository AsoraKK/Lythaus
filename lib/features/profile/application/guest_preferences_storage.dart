// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';

abstract interface class GuestPreferencesStorage {
  Future<PresentationPreferences> load();
  Future<void> save(PresentationPreferences preferences);
}

class SecureGuestPreferencesStorage implements GuestPreferencesStorage {
  const SecureGuestPreferencesStorage();
  static const key = 'lythaus.guest.presentation.v1';
  static const _storage = FlutterSecureStorage(
    webOptions: WebOptions(
      dbName: 'LythausGuestPreferences',
      publicKey: 'LythausGuestPreferences',
    ),
  );

  @override
  Future<PresentationPreferences> load() async {
    final value = await _storage.read(key: key);
    if (value == null) return const PresentationPreferences();
    return PresentationPreferences.fromJson(
      Map<String, dynamic>.from(jsonDecode(value) as Map),
    );
  }

  @override
  Future<void> save(PresentationPreferences preferences) =>
      _storage.write(key: key, value: jsonEncode(preferences.toJson()));
}

final guestPreferencesStorageProvider = Provider<GuestPreferencesStorage>(
  (_) => const SecureGuestPreferencesStorage(),
);

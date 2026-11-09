import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Device-local appearance storage, shared by guests and signed-in sessions.
/// This preference contains no account data and is never sent to the backend.
abstract interface class ThemeModeStorage {
  /// Returns System for an absent or unrecognised stored choice.
  Future<ThemeMode> load();

  /// Persists the selected mode, including System rather than its brightness.
  Future<void> save(ThemeMode mode);
}

/// Uses the same local secure-storage convention as guest preferences.
class SecureThemeModeStorage implements ThemeModeStorage {
  /// Allows a storage implementation to be supplied in focused tests.
  const SecureThemeModeStorage({
    FlutterSecureStorage storage = const FlutterSecureStorage(
      webOptions: WebOptions(
        dbName: 'LythausAppearance',
        publicKey: 'LythausAppearance',
      ),
    ),
  }) : _storage = storage;

  /// Versioned, device-wide key. It is deliberately independent of sign-in.
  static const key = 'lythaus.appearance.mode.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<ThemeMode> load() async {
    final value = await _storage.read(key: key);
    return switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  @override
  Future<void> save(ThemeMode mode) =>
      _storage.write(key: key, value: mode.name);
}

/// Replace this provider to test appearance without platform storage.
final themeModeStorageProvider = Provider<ThemeModeStorage>(
  (_) => const SecureThemeModeStorage(),
);

/// Watch for MaterialApp.themeMode or the shell's selected appearance control.
/// Change with ref.read(themeModeProvider.notifier).setThemeMode(mode).
final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(ref.watch(themeModeStorageProvider)),
);

/// Applies choices immediately while serialising their persistence.
class ThemeModeController extends StateNotifier<ThemeMode> {
  /// Starts with System until the saved preference has been restored.
  ThemeModeController(this._storage) : super(ThemeMode.system) {
    ready = _restore();
  }

  final ThemeModeStorage _storage;
  int _revision = 0;
  Future<void> _writes = Future<void>.value();

  /// Completes even when storage is unavailable; System remains the fallback.
  late final Future<void> ready;

  Future<void> _restore() async {
    final revision = _revision;
    try {
      final saved = await _storage.load();
      if (mounted && revision == _revision) state = saved;
    } catch (_) {
      // Appearance must not prevent startup when device storage is unavailable.
    }
  }

  /// Returns whether the choice was saved. A failed save retains the selection
  /// for this session, so callers can explain that it will not survive restart.
  /// A later user choice always wins over an in-flight initial restore.
  Future<bool> setThemeMode(ThemeMode mode) {
    if (!mounted) return Future<bool>.value(false);
    _revision++;
    state = mode;
    final result = _writes.then((_) async {
      try {
        await _storage.save(mode);
        return true;
      } catch (_) {
        return false;
      }
    });
    _writes = result.then<void>((_) {});
    return result;
  }
}

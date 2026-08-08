import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_consent_storage.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSecureStorage extends FlutterSecureStorage {
  final Map<String, String> _data = {};

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value != null) {
      _data[key] = value;
    }
  }

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    return _data[key];
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    _data.remove(key);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('load returns default consent when storage empty', () async {
    final storage = _FakeSecureStorage();
    final consentStorage = AnalyticsConsentStorage(storage: storage);

    final consent = await consentStorage.load();

    expect(consent.enabled, isFalse);
  });

  test('load parses stored consent', () async {
    final storage = _FakeSecureStorage();
    final consentStorage = AnalyticsConsentStorage(storage: storage);

    // Replace with JSON to avoid string map parsing differences
    await storage.write(
      key: 'analytics_consent',
      value:
          '{"enabled":true,"updatedAt":"2024-01-01T00:00:00.000Z","source":"onboarding","policyVersion":2}',
    );

    final consent = await consentStorage.load();

    expect(consent.enabled, isTrue);
    expect(consent.source, ConsentSource.onboarding);
    expect(consent.policyVersion, 2);
  });

  test('load returns default on invalid json', () async {
    final storage = _FakeSecureStorage();
    final consentStorage = AnalyticsConsentStorage(storage: storage);

    await storage.write(key: 'analytics_consent', value: 'not-json');

    final consent = await consentStorage.load();
    expect(consent.enabled, isFalse);
  });

  test('save writes consent to storage', () async {
    final storage = _FakeSecureStorage();
    final consentStorage = AnalyticsConsentStorage(storage: storage);

    final consent = AnalyticsConsent(
      enabled: true,
      updatedAt: DateTime.utc(2024, 1, 1),
      source: ConsentSource.privacySettings,
      policyVersion: 1,
    );

    await consentStorage.save(consent);

    final stored = await storage.read(key: 'analytics_consent');
    expect(stored, contains('"enabled":true'));
  });

  test('clear removes consent key', () async {
    final storage = _FakeSecureStorage();
    final consentStorage = AnalyticsConsentStorage(storage: storage);

    await storage.write(key: 'analytics_consent', value: '{}');
    await consentStorage.clear();

    final stored = await storage.read(key: 'analytics_consent');
    expect(stored, isNull);
  });
}

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
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
}

class _FakeAnalyticsClient implements AnalyticsClient {
  final List<String> events = [];

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    events.add(name);
  }

  @override
  Future<void> reset() async {}

  @override
  Future<void> setUserId(String? userId) async {}

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {}
}

class _ThrowingSecureStorage extends FlutterSecureStorage {
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
    throw StateError('write failed');
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
    throw StateError('read failed');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('logEventOnce only emits on first call', () async {
    final storage = _FakeSecureStorage();
    final tracker = AnalyticsEventTracker(storage: storage);
    final client = _FakeAnalyticsClient();

    final first = await tracker.logEventOnce(client, 'onboarding_start');
    final second = await tracker.logEventOnce(client, 'onboarding_start');

    expect(first, isTrue);
    expect(second, isFalse);
    expect(client.events, ['onboarding_start']);
  });

  test('logEventOnce is scoped by userId', () async {
    final storage = _FakeSecureStorage();
    final tracker = AnalyticsEventTracker(storage: storage);
    final client = _FakeAnalyticsClient();

    final userA = await tracker.logEventOnce(
      client,
      'first_post',
      userId: 'user-a',
    );
    final userB = await tracker.logEventOnce(
      client,
      'first_post',
      userId: 'user-b',
    );
    final repeatA = await tracker.logEventOnce(
      client,
      'first_post',
      userId: 'user-a',
    );

    expect(userA, isTrue);
    expect(userB, isTrue);
    expect(repeatA, isFalse);
    expect(client.events, ['first_post', 'first_post']);
  });

  test('logEventOnce tolerates storage failures', () async {
    final tracker = AnalyticsEventTracker(storage: _ThrowingSecureStorage());
    final client = _FakeAnalyticsClient();

    final first = await tracker.logEventOnce(client, 'app_started');
    final second = await tracker.logEventOnce(client, 'app_started');

    expect(first, isTrue);
    expect(second, isTrue);
    expect(client.events, ['app_started', 'app_started']);
  });

  test('wasLogged returns false when storage read fails', () async {
    final tracker = AnalyticsEventTracker(storage: _ThrowingSecureStorage());

    final result = await tracker.wasLogged('app_started');

    expect(result, isFalse);
  });
}

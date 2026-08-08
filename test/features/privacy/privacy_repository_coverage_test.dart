import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/core/logging/app_logger.dart';

class _MockApi implements PrivacyApi {
  ExportRequestResult? exportResult;
  ExportStatusDTO? statusResult;
  PrivacyApiException? throwOnExport;
  PrivacyApiException? throwOnStatus;
  PrivacyApiException? throwOnDelete;
  bool deleteCalled = false;

  @override
  Future<ExportRequestResult> requestExport({required String authToken}) async {
    if (throwOnExport != null) throw throwOnExport!;
    return exportResult!;
  }

  @override
  Future<ExportStatusDTO> getExportStatus({required String authToken}) async {
    if (throwOnStatus != null) throw throwOnStatus!;
    return statusResult!;
  }

  @override
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {
    if (throwOnDelete != null) throw throwOnDelete!;
    deleteCalled = true;
  }
}

class _FakeStorage implements FlutterSecureStorage {
  final Map<String, String> _store = {};

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => _store[key];

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
    if (value == null) {
      _store.remove(key);
    } else {
      _store[key] = value;
    }
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
  }) async => _store.remove(key);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _MockLogger implements AppLogger {
  final List<String> messages = [];

  @override
  void info(String message, [Object? error, StackTrace? stackTrace]) {
    messages.add(message);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  // ─── ExportSnapshot ───
  group('ExportSnapshot', () {
    test('default values', () {
      const s = ExportSnapshot();
      expect(s.lastExportAt, isNull);
      expect(s.remainingCooldown, Duration.zero);
      expect(s.serverState, isNull);
    });

    test('stores all fields', () {
      final now = DateTime(2024, 6, 15);
      final s = ExportSnapshot(
        lastExportAt: now,
        remainingCooldown: const Duration(hours: 12),
        serverState: 'email_sent',
      );
      expect(s.lastExportAt, now);
      expect(s.remainingCooldown, const Duration(hours: 12));
      expect(s.serverState, 'email_sent');
    });
  });

  // ─── PrivacyException ───
  group('PrivacyException', () {
    test('stores type and message', () {
      const e = PrivacyException(PrivacyErrorType.unauthorized, 'no auth');
      expect(e.type, PrivacyErrorType.unauthorized);
      expect(e.message, 'no auth');
      expect(e.retryAfter, isNull);
    });

    test('stores retryAfter', () {
      const e = PrivacyException(
        PrivacyErrorType.rateLimited,
        'slow down',
        retryAfter: Duration(minutes: 5),
      );
      expect(e.retryAfter, const Duration(minutes: 5));
    });
  });

  // ─── PrivacyRepository ───
  group('PrivacyRepository', () {
    late _MockApi api;
    late _FakeStorage storage;
    late _MockLogger logger;
    late DateTime fakeNow;

    setUp(() {
      api = _MockApi();
      storage = _FakeStorage();
      logger = _MockLogger();
      fakeNow = DateTime.utc(2024, 6, 15, 12, 0);
    });

    PrivacyRepository createRepo({Duration? cooldown}) {
      return PrivacyRepository(
        api: api,
        storage: storage,
        logger: logger,
        cooldownWindow: cooldown ?? const Duration(hours: 24),
        clock: () => fakeNow,
      );
    }

    test('cooldownWindow returns configured value', () {
      final repo = createRepo(cooldown: const Duration(hours: 48));
      expect(repo.cooldownWindow, const Duration(hours: 48));
    });

    test('loadPersistedSnapshot returns empty when no data', () async {
      final repo = createRepo();
      final snap = await repo.loadPersistedSnapshot();
      expect(snap.lastExportAt, isNull);
      expect(snap.remainingCooldown, Duration.zero);
    });

    test('loadPersistedSnapshot returns data when stored', () async {
      final repo = createRepo();
      // Store a timestamp 6 hours ago (18 hours remaining)
      final stored = fakeNow.subtract(const Duration(hours: 6));
      await storage.write(
        key: 'privacy.lastExportAt',
        value: stored.toIso8601String(),
      );
      final snap = await repo.loadPersistedSnapshot();
      expect(snap.lastExportAt, isNotNull);
      expect(snap.remainingCooldown.inHours, 18);
    });

    test('clearPersistedExport clears storage', () async {
      final repo = createRepo();
      await storage.write(
        key: 'privacy.lastExportAt',
        value: DateTime.now().toIso8601String(),
      );
      await repo.clearPersistedExport();
      final snap = await repo.loadPersistedSnapshot();
      expect(snap.lastExportAt, isNull);
    });

    test('requestExport stores result and returns snapshot', () async {
      final repo = createRepo();
      api.exportResult = ExportRequestResult(
        requestId: 'request-1',
        acceptedAt: fakeNow,
        retryAfter: const Duration(hours: 24),
      );

      final snap = await repo.requestExport(authToken: 'tok');
      expect(snap.serverState, 'accepted');
      expect(snap.remainingCooldown, const Duration(hours: 24));
      expect(logger.messages, contains('privacy_repository.request_export'));
    });

    test('requestExport maps API exceptions', () async {
      final repo = createRepo();
      api.throwOnExport = const PrivacyApiException(
        PrivacyErrorType.unauthorized,
        message: 'no auth',
      );

      expect(
        () => repo.requestExport(authToken: 'tok'),
        throwsA(isA<PrivacyException>()),
      );
    });

    test('fetchRemoteStatus returns snapshot', () async {
      final repo = createRepo();
      api.statusResult = ExportStatusDTO(
        acceptedAt: fakeNow.subtract(const Duration(hours: 2)),
        retryAfterSeconds: null,
        state: 'processing',
      );

      final snap = await repo.fetchRemoteStatus(authToken: 'tok');
      expect(snap.serverState, 'processing');
      expect(snap.remainingCooldown.inHours, greaterThanOrEqualTo(21));
    });

    test(
      'fetchRemoteStatus derives timestamp from retryAfterSeconds when acceptedAt is null',
      () async {
        final repo = createRepo();
        api.statusResult = const ExportStatusDTO(
          acceptedAt: null,
          retryAfterSeconds: 3600, // 1 hour remaining
          state: 'pending',
        );

        final snap = await repo.fetchRemoteStatus(authToken: 'tok');
        expect(snap.serverState, 'pending');
        // 1 hour remaining out of 24 hours
        expect(snap.remainingCooldown.inMinutes, 60);
      },
    );

    test('fetchRemoteStatus maps API exceptions', () async {
      final repo = createRepo();
      api.throwOnStatus = const PrivacyApiException(
        PrivacyErrorType.rateLimited,
        message: 'slow down',
        retryAfter: Duration(minutes: 5),
      );

      expect(
        () => repo.fetchRemoteStatus(authToken: 'tok'),
        throwsA(isA<PrivacyException>()),
      );
    });

    test(
      'deleteAccount calls api and preserves export status history',
      () async {
        final repo = createRepo();
        await storage.write(
          key: 'privacy.lastExportAt',
          value: DateTime.now().toIso8601String(),
        );

        await repo.deleteAccount(authToken: 'tok', hardDelete: true);
        expect(api.deleteCalled, isTrue);

        final snap = await repo.loadPersistedSnapshot();
        expect(snap.lastExportAt, isNotNull);
      },
    );

    test('deleteAccount maps API exceptions', () async {
      final repo = createRepo();
      api.throwOnDelete = const PrivacyApiException(
        PrivacyErrorType.server,
        message: 'server error',
      );

      expect(
        () => repo.deleteAccount(authToken: 'tok', hardDelete: false),
        throwsA(isA<PrivacyException>()),
      );
    });

    test('estimateLastExportFromRemaining derives timestamp', () {
      final repo = createRepo();
      final ts = repo.estimateLastExportFromRemaining(
        const Duration(hours: 12),
      );
      // 12 hours remaining → started 12 hours ago
      final elapsed = fakeNow.difference(ts);
      expect(elapsed.inHours, 12);
    });

    test('snapshot clamps negative remaining to zero', () async {
      final repo = createRepo();
      // Store a timestamp well beyond cooldown
      final old = fakeNow.subtract(const Duration(hours: 48));
      await storage.write(
        key: 'privacy.lastExportAt',
        value: old.toIso8601String(),
      );
      final snap = await repo.loadPersistedSnapshot();
      expect(snap.remainingCooldown, Duration.zero);
    });

    test('snapshot clamps oversized remaining to cooldown window', () async {
      final repo = createRepo();
      api.exportResult = ExportRequestResult(
        requestId: 'request-2',
        acceptedAt: fakeNow,
        retryAfter: const Duration(hours: 48), // exceeds 24h cooldown
      );

      final snap = await repo.requestExport(authToken: 'tok');
      expect(snap.remainingCooldown, const Duration(hours: 24));
    });

    test('network error maps correctly', () async {
      final repo = createRepo();
      api.throwOnExport = const PrivacyApiException(
        PrivacyErrorType.network,
        message: 'timeout',
      );

      try {
        await repo.requestExport(authToken: 'tok');
        fail('Should have thrown');
      } on PrivacyException catch (e) {
        expect(e.type, PrivacyErrorType.network);
        expect(e.message, contains('Try again'));
      }
    });

    test('server error maps correctly', () async {
      final repo = createRepo();
      api.throwOnExport = const PrivacyApiException(
        PrivacyErrorType.server,
        message: '500',
      );

      try {
        await repo.requestExport(authToken: 'tok');
        fail('Should have thrown');
      } on PrivacyException catch (e) {
        expect(e.type, PrivacyErrorType.server);
        expect(e.message, contains('Try again'));
      }
    });
  });
}

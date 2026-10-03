import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'test_doubles.dart';

void main() {
  late TestPrivacyApi api;
  late MemoryPrivacyStorage storage;
  late PrivacyRepository repo;
  final accepted = DateTime.utc(2026, 10, 1, 12);
  final completed = DateTime.utc(2026, 10, 2, 12);

  setUp(() {
    api = TestPrivacyApi();
    storage = MemoryPrivacyStorage();
    repo = PrivacyRepository(
      api: api,
      storage: storage,
      logger: AppLogger(),
      actorId: 'owner-a',
    );
  });

  test('native cooldown is not capped by a client day', () async {
    api.status = ExportStatusDTO(
      state: 'completed',
      acceptedAt: accepted,
      requestId: 'export-a',
      retryAfterSeconds: const Duration(days: 29).inSeconds,
    );
    expect(
      (await repo.fetchRemoteStatus(authToken: 'token')).remainingCooldown,
      const Duration(days: 29),
    );
  });

  for (final state in [
    'received',
    'processing',
    'blocked',
    'completed',
    'failed',
  ]) {
    test(
      'native $state preserves identity, timestamps and independent cooldown',
      () async {
        api.status = ExportStatusDTO(
          state: state,
          requestId: 'export-a',
          acceptedAt: accepted,
          completedAt: state == 'completed' ? completed : null,
          retryAfterSeconds: 29 * 86400,
          canRequest: false,
        );
        final value = await repo.fetchRemoteStatus(authToken: 'synthetic');
        expect(value.serverState, state);
        expect(value.requestId, 'export-a');
        expect(value.lastExportAt, accepted.toLocal());
        expect(value.completedAt, state == 'completed' ? completed : null);
        expect(value.remainingCooldown, const Duration(days: 29));
        expect(value.canRequest, isFalse);
        expect(value.cooldownKnown, isTrue);
      },
    );
  }

  test(
    'native null history clears owner cache without falling back to legacy timestamp',
    () async {
      storage.values['privacy.lastExportAt'] = accepted.toIso8601String();
      storage.values['privacy.lastExportAt.v2.owner-a'] = accepted
          .toIso8601String();
      api.status = const ExportStatusDTO(state: 'idle', canRequest: true);
      final value = await repo.fetchRemoteStatus(authToken: 'synthetic');
      expect(value.lastExportAt, isNull);
      expect(value.requestId, isNull);
      expect(value.canRequest, isTrue);
      expect(
        storage.values.containsKey('privacy.lastExportAt.v2.owner-a'),
        isFalse,
      );
      expect(
        storage.values['privacy.lastExportAt'],
        accepted.toIso8601String(),
      );
    },
  );

  test('cache is account scoped and does not authorize requests', () async {
    storage.values['privacy.lastExportAt'] = accepted.toIso8601String();
    expect((await repo.loadPersistedSnapshot()).lastExportAt, isNull);
    api.onExport = () async =>
        ExportRequestResult(requestId: 'export-a', acceptedAt: accepted);
    await repo.requestExport(authToken: 'synthetic');
    final a = await repo.loadPersistedSnapshot();
    expect(a.lastExportAt, accepted.toLocal());
    expect(a.canRequest, isFalse);
    expect(a.cooldownKnown, isFalse);
    final b = PrivacyRepository(
      api: api,
      storage: storage,
      logger: AppLogger(),
      actorId: 'owner-b',
    );
    expect((await b.loadPersistedSnapshot()).lastExportAt, isNull);
    expect(storage.values.keys, contains('privacy.lastExportAt.v2.owner-a'));
  });

  test('guest never reads the account cache', () async {
    final guest = PrivacyRepository(
      api: api,
      storage: storage,
      logger: AppLogger(),
    );
    storage.values['privacy.lastExportAt'] = accepted.toIso8601String();
    expect((await guest.loadPersistedSnapshot()).lastExportAt, isNull);
    expect((await guest.loadPersistedSnapshot()).canRequest, isFalse);
  });

  test('malformed cache does not invent timestamp or permission', () async {
    storage.values['privacy.lastExportAt.v2.owner-a'] = 'not-a-date';
    expect((await repo.loadPersistedSnapshot()).lastExportAt, isNull);
  });

  test(
    'unknown policy preserves request but never authorizes export',
    () async {
      api.status = ExportStatusDTO(
        state: 'completed',
        requestId: 'export-a',
        acceptedAt: accepted,
        completedAt: completed,
      );
      final result = await repo.fetchRemoteStatus(authToken: 'synthetic');
      expect(result.serverState, 'completed');
      expect(result.cooldownKnown, isFalse);
      expect(result.canRequest, isFalse);
      expect(result.lastExportAt, accepted.toLocal());
    },
  );

  test(
    'request acknowledgement is received and remains asynchronous',
    () async {
      api.onExport = () async => ExportRequestResult(
        requestId: 'export-a',
        acceptedAt: accepted,
        retryAfter: const Duration(days: 30),
      );
      final result = await repo.requestExport(authToken: 'synthetic');
      expect(result.serverState, 'received');
      expect(result.requestId, 'export-a');
      expect(result.remainingCooldown, const Duration(days: 30));
      expect(result.canRequest, isFalse);
      expect(
        storage.values['privacy.lastExportAt.v2.owner-a'],
        accepted.toIso8601String(),
      );
    },
  );

  test(
    'failed local cache write preserves accepted server acknowledgement',
    () async {
      storage.failWrites = true;
      final result = await repo.requestExport(authToken: 'synthetic');
      expect(result.requestId, 'request-1');
      expect(result.serverState, 'received');
    },
  );

  test('failed cache read remains unknown', () async {
    storage.failReads = true;
    expect((await repo.loadPersistedSnapshot()).canRequest, isFalse);
  });

  test(
    'deletion acknowledgement and held status preserve identity without erasing cache',
    () async {
      storage.values['privacy.lastExportAt.v2.owner-a'] = accepted
          .toIso8601String();
      final ack = await repo.deleteAccount(authToken: 'synthetic');
      expect(ack.state, 'received');
      expect(ack.requestId, 'delete-1');
      api.deletion = ExportStatusDTO(
        state: 'blocked',
        requestId: 'delete-1',
        acceptedAt: accepted,
      );
      expect(
        (await repo.fetchDeletionStatus(authToken: 'synthetic')).state,
        'blocked',
      );
      expect(
        (await repo.loadPersistedSnapshot()).lastExportAt,
        accepted.toLocal(),
      );
    },
  );

  test('clearing cache affects only the current account', () async {
    storage.values['privacy.lastExportAt.v2.owner-a'] = accepted
        .toIso8601String();
    storage.values['privacy.lastExportAt.v2.owner-b'] = accepted
        .toIso8601String();
    storage.values['privacy.lastExportAt'] = accepted.toIso8601String();
    await repo.clearPersistedExport();
    expect(
      storage.values.keys,
      unorderedEquals([
        'privacy.lastExportAt.v2.owner-b',
        'privacy.lastExportAt',
      ]),
    );
  });

  for (final type in PrivacyErrorType.values) {
    test('$type API error maps without dropping retry information', () async {
      api.onExport = () =>
          throw PrivacyApiException(type, retryAfter: const Duration(days: 29));
      await expectLater(
        repo.requestExport(authToken: 'synthetic'),
        throwsA(
          isA<PrivacyException>()
              .having((value) => value.type, 'type', type)
              .having(
                (value) => value.retryAfter,
                'retryAfter',
                const Duration(days: 29),
              ),
        ),
      );
    });
  }
}

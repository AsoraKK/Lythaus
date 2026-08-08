import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockApi extends Mock implements PrivacyApi {}

class _MockStorage extends Mock implements FlutterSecureStorage {}

void main() {
  group('PrivacyRepository', () {
    late _MockApi api;
    late _MockStorage storage;
    late PrivacyRepository repository;
    late DateTime now;
    final store = <String, String?>{};

    setUp(() {
      api = _MockApi();
      storage = _MockStorage();
      now = DateTime.utc(2024, 1, 1, 12);
      repository = PrivacyRepository(
        api: api,
        storage: storage,
        logger: AppLogger(),
        clock: () => now,
      );

      store.clear();
      when(() => storage.read(key: any(named: 'key'))).thenAnswer((invocation) {
        final key = invocation.namedArguments[#key] as String;
        return Future.value(store[key]);
      });
      when(
        () => storage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((invocation) async {
        final key = invocation.namedArguments[#key] as String;
        final value = invocation.namedArguments[#value] as String?;
        store[key] = value;
      });
      when(() => storage.delete(key: any(named: 'key'))).thenAnswer((
        invocation,
      ) async {
        final key = invocation.namedArguments[#key] as String;
        store.remove(key);
      });
    });

    test(
      'requestExport persists acceptedAt and computes cooldown window',
      () async {
        final acceptedAt = DateTime.utc(2024, 1, 1, 10);
        when(
          () => api.requestExport(authToken: any(named: 'authToken')),
        ).thenAnswer((_) async {
          return ExportRequestResult(
            requestId: 'request-1',
            acceptedAt: acceptedAt,
            retryAfter: const Duration(hours: 24),
          );
        });

        final snapshot = await repository.requestExport(authToken: 'token');

        expect(snapshot.lastExportAt, acceptedAt.toLocal());
        expect(snapshot.remainingCooldown, const Duration(hours: 24));
        verify(
          () => storage.write(
            key: any(named: 'key'),
            value: acceptedAt.toIso8601String(),
          ),
        ).called(1);
      },
    );

    test(
      'loadPersistedSnapshot returns stored timestamp and remaining time',
      () async {
        final stored = DateTime.utc(2024, 1, 1, 11);
        store['privacy.lastExportAt'] = stored.toIso8601String();

        final snapshot = await repository.loadPersistedSnapshot();
        expect(snapshot.lastExportAt, stored.toLocal());
        expect(snapshot.remainingCooldown, const Duration(hours: 23));
      },
    );

    test('loadPersistedSnapshot ignores malformed timestamp', () async {
      store['privacy.lastExportAt'] = 'not-a-date';

      final snapshot = await repository.loadPersistedSnapshot();

      expect(snapshot.lastExportAt, isNull);
      expect(snapshot.remainingCooldown, Duration.zero);
    });

    test('fetchRemoteStatus prefers server acceptedAt', () async {
      final acceptedAt = now;
      when(
        () => api.getExportStatus(authToken: any(named: 'authToken')),
      ).thenAnswer((_) async {
        return ExportStatusDTO(
          state: 'queued',
          acceptedAt: acceptedAt,
          retryAfterSeconds: null,
        );
      });

      final snapshot = await repository.fetchRemoteStatus(authToken: 'token');
      expect(snapshot.lastExportAt, acceptedAt.toLocal());
      expect(snapshot.remainingCooldown, const Duration(hours: 24));
      expect(snapshot.serverState, 'queued');
    });

    test(
      'fetchRemoteStatus falls back to persisted timestamp when server empty',
      () async {
        final stored = DateTime.utc(2024, 1, 1, 7);
        store['privacy.lastExportAt'] = stored.toIso8601String();
        when(
          () => api.getExportStatus(authToken: any(named: 'authToken')),
        ).thenAnswer((_) async {
          return const ExportStatusDTO(
            state: 'idle',
            acceptedAt: null,
            retryAfterSeconds: null,
          );
        });

        final snapshot = await repository.fetchRemoteStatus(authToken: 'token');
        expect(snapshot.lastExportAt, stored.toLocal());
      },
    );

    test(
      'fetchRemoteStatus derives timestamp from retryAfterSeconds',
      () async {
        when(
          () => api.getExportStatus(authToken: any(named: 'authToken')),
        ).thenAnswer((_) async {
          return const ExportStatusDTO(
            state: 'cooldown',
            acceptedAt: null,
            retryAfterSeconds: 3600,
          );
        });

        final snapshot = await repository.fetchRemoteStatus(authToken: 'token');
        expect(snapshot.remainingCooldown, const Duration(hours: 1));
        expect(snapshot.serverState, 'cooldown');
        expect(snapshot.lastExportAt, isNotNull);
      },
    );

    test('requestExport clamps retryAfter to cooldown window', () async {
      final acceptedAt = DateTime.utc(2024, 1, 1, 10);
      when(
        () => api.requestExport(authToken: any(named: 'authToken')),
      ).thenAnswer((_) async {
        return ExportRequestResult(
          requestId: 'request-2',
          acceptedAt: acceptedAt,
          retryAfter: const Duration(hours: 48),
        );
      });

      final snapshot = await repository.requestExport(authToken: 'token');
      expect(snapshot.remainingCooldown, const Duration(hours: 24));
    });

    test('deleteAccount preserves export status history', () async {
      when(
        () => api.deleteAccount(
          authToken: any(named: 'authToken'),
          hardDelete: any(named: 'hardDelete'),
        ),
      ).thenAnswer((_) async {});

      await repository.deleteAccount(authToken: 'token', hardDelete: true);
      verifyNever(() => storage.delete(key: 'privacy.lastExportAt'));
    });

    test('maps api exceptions to user friendly privacy exceptions', () async {
      when(
        () => api.requestExport(authToken: any(named: 'authToken')),
      ).thenThrow(
        const PrivacyApiException(
          PrivacyErrorType.rateLimited,
          retryAfter: Duration(hours: 1),
        ),
      );

      expect(
        () => repository.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyException>()
              .having((e) => e.type, 'type', PrivacyErrorType.rateLimited)
              .having(
                (e) => e.retryAfter,
                'retryAfter',
                const Duration(hours: 1),
              ),
        ),
      );
    });

    test('maps unauthorized api exception to sign-in message', () async {
      when(
        () => api.requestExport(authToken: any(named: 'authToken')),
      ).thenThrow(const PrivacyApiException(PrivacyErrorType.unauthorized));

      await expectLater(
        repository.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyException>()
              .having((e) => e.type, 'type', PrivacyErrorType.unauthorized)
              .having(
                (e) => e.message,
                'message',
                'Session expired. Please sign in.',
              ),
        ),
      );
    });

    test('maps network api exception to generic retry message', () async {
      when(
        () => api.requestExport(authToken: any(named: 'authToken')),
      ).thenThrow(const PrivacyApiException(PrivacyErrorType.network));

      await expectLater(
        repository.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyException>()
              .having((e) => e.type, 'type', PrivacyErrorType.network)
              .having(
                (e) => e.message,
                'message',
                'Something went wrong. Try again.',
              ),
        ),
      );
    });

    test('maps server api exception to generic retry message', () async {
      when(
        () => api.requestExport(authToken: any(named: 'authToken')),
      ).thenThrow(const PrivacyApiException(PrivacyErrorType.server));

      await expectLater(
        repository.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyException>()
              .having((e) => e.type, 'type', PrivacyErrorType.server)
              .having(
                (e) => e.message,
                'message',
                'Something went wrong. Try again.',
              ),
        ),
      );
    });
  });
}

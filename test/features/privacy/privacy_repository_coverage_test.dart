import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'test_doubles.dart';

void main() {
  test('snapshot defaults preserve unknown permission', () {
    const snapshot = ExportSnapshot();
    expect(snapshot.lastExportAt, isNull);
    expect(snapshot.serverState, isNull);
    expect(snapshot.requestId, isNull);
    expect(snapshot.canRequest, isFalse);
    expect(snapshot.cooldownKnown, isFalse);
  });

  test(
    'negative server duration clamps to zero without inventing authorization',
    () async {
      final api = TestPrivacyApi()
        ..status = const ExportStatusDTO(
          state: 'failed',
          retryAfterSeconds: -1,
          canRequest: false,
        );
      final repo = PrivacyRepository(
        api: api,
        storage: NullSecureStorage(),
        logger: AppLogger(),
        actorId: 'a',
      );
      final value = await repo.fetchRemoteStatus(authToken: 'synthetic');
      expect(value.remainingCooldown, Duration.zero);
      expect(value.canRequest, isFalse);
    },
  );

  test('download bytes never enter local cache', () async {
    final api = TestPrivacyApi();
    final store = MemoryPrivacyStorage();
    final repo = PrivacyRepository(
      api: api,
      storage: store,
      logger: AppLogger(),
      actorId: 'a',
    );
    final bytes = await repo.downloadExport(
      authToken: 'synthetic',
      requestId: 'export-a',
    );
    expect(bytes, Uint8List.fromList([123, 125]));
    expect(store.values, isEmpty);
    expect(api.downloadCalls, 1);
  });

  for (final operation in ['status', 'deletion-status', 'delete', 'download']) {
    for (final type in PrivacyErrorType.values) {
      test('$operation maps $type while preserving retry-after', () async {
        final api = TestPrivacyApi();
        final error = PrivacyApiException(
          type,
          retryAfter: const Duration(minutes: 2),
        );
        api.onStatus = () => throw error;
        api.onDeletionStatus = () => throw error;
        api.onDelete = () => throw error;
        api.onDownload = () => throw error;
        final repo = PrivacyRepository(
          api: api,
          storage: NullSecureStorage(),
          logger: AppLogger(),
          actorId: 'a',
        );
        final Future<Object?> result = switch (operation) {
          'status' => repo.fetchRemoteStatus(authToken: 'synthetic'),
          'deletion-status' => repo.fetchDeletionStatus(authToken: 'synthetic'),
          'delete' => repo.deleteAccount(authToken: 'synthetic'),
          _ => repo.downloadExport(authToken: 'synthetic', requestId: 'a'),
        };
        await expectLater(
          result,
          throwsA(
            isA<PrivacyException>()
                .having((value) => value.type, 'type', type)
                .having(
                  (value) => value.retryAfter,
                  'retryAfter',
                  const Duration(minutes: 2),
                ),
          ),
        );
      });
    }
  }
}

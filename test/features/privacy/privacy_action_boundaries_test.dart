import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';

import 'test_doubles.dart';

class _Harness {
  final api = TestPrivacyApi();
  final storage = MemoryPrivacyStorage();
  DateTime now = DateTime.utc(2026, 10, 3, 12);
  int signOuts = 0;
  bool tokenFailure = false;
  late final provider = StateNotifierProvider<PrivacyController, PrivacyState>(
    (ref) => PrivacyController(
      ref: ref,
      repository: PrivacyRepository(
        api: api,
        storage: storage,
        logger: AppLogger(),
        actorId: 'a',
      ),
      logger: AppLogger(),
      analyticsClient: const NullAnalyticsClient(),
      clock: () => now,
      onSignOut: () async {
        signOuts++;
      },
    ),
  );
  late final container = ProviderContainer(
    overrides: [
      jwtProvider.overrideWith((ref) async {
        if (tokenFailure) throw StateError('synthetic token transport failure');
        return 'synthetic-a';
      }),
    ],
  );
  PrivacyController get controller => container.read(provider.notifier);
  PrivacyState get state => container.read(provider);
  Future<void> refresh() => controller.refreshStatus();
  Future<void> settleUntil(bool Function() condition) async {
    for (var i = 0; i < 25 && !condition(); i++) {
      await Future<void>.delayed(Duration.zero);
    }
    expect(condition(), isTrue);
  }

  void dispose() => container.dispose();
}

ExportStatusDTO _completed(int seconds) => ExportStatusDTO(
  state: 'completed',
  requestId: 'a-export',
  acceptedAt: DateTime.utc(2026, 10, 2),
  completedAt: DateTime.utc(2026, 10, 2, 13),
  retryAfterSeconds: seconds,
  canRequest: seconds == 0,
);

void main() {
  test(
    'expiry keeps requests disabled until a fresh server response confirms permission',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      h.api.status = _completed(29 * 86400);
      await h.refresh();
      final pending = Completer<ExportStatusDTO>();
      h.api.onStatus = () => pending.future;
      h.now = h.now.add(const Duration(days: 29));
      h.controller.debugTickCooldown();
      await h.settleUntil(() => h.api.statusCalls == 2);
      expect(h.state.remainingCooldown, Duration.zero);
      expect(h.state.canRequestExport, isFalse);
      expect(h.state.exportStatus, ExportStatus.unknown);
      await h.controller.export();
      expect(h.api.exportCalls, 0);
      pending.complete(_completed(0));
      await h.settleUntil(() => !h.state.refreshing);
      expect(h.state.exportStatus, ExportStatus.completed);
      expect(h.state.canRequestExport, isTrue);
    },
  );

  test('expiry never bypasses a processing or retention hold', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.api.status = const ExportStatusDTO(
      state: 'blocked',
      requestId: 'a-export',
      retryAfterSeconds: 1,
    );
    h.api.deletion = const ExportStatusDTO(
      state: 'blocked',
      requestId: 'a-delete',
    );
    await h.refresh();
    h.api.status = const ExportStatusDTO(
      state: 'blocked',
      requestId: 'a-export',
      retryAfterSeconds: 0,
    );
    h.now = h.now.add(const Duration(seconds: 2));
    h.controller.debugTickCooldown();
    await h.settleUntil(() => h.api.statusCalls == 2 && !h.state.refreshing);
    expect(h.state.exportStatus, ExportStatus.blocked);
    expect(h.state.deleteStatus, DeleteStatus.blocked);
    await h.controller.export();
    await h.controller.delete();
    expect(h.api.exportCalls, 0);
    expect(h.api.deleteCalls, 0);
  });

  test(
    'a failed refresh makes old completed history unavailable for new actions and downloads',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      h.api.status = _completed(0);
      await h.refresh();
      expect(h.state.canDownload, isTrue);
      h.api.onStatus = () async => throw const PrivacyApiException(
        PrivacyErrorType.server,
        statusCode: 404,
      );
      await h.refresh();
      expect(h.state.exportStatus, ExportStatus.unknown);
      expect(h.state.deleteStatus, DeleteStatus.unknown);
      expect(h.state.canDownload, isFalse);
      expect(h.state.canRequestExport, isFalse);
      expect(h.state.error, isNotNull);
      await h.controller.export();
      expect(await h.controller.download(), isNull);
      expect(h.api.exportCalls, 0);
      expect(h.api.downloadCalls, 0);
    },
  );

  test(
    'repeated download is blocked while verified bytes are pending and refresh does not interrupt it',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      h.api.status = _completed(0);
      await h.refresh();
      final pending = Completer<Uint8List>();
      h.api.onDownload = () => pending.future;
      final first = h.controller.download();
      await h.settleUntil(() => h.api.downloadCalls == 1);
      expect(await h.controller.download(), isNull);
      await h.refresh();
      await h.controller.export();
      await h.controller.delete();
      expect(h.api.statusCalls, 1);
      expect(h.api.exportCalls, 0);
      expect(h.api.deleteCalls, 0);
      pending.complete(Uint8List.fromList([123, 125]));
      expect(await first, [123, 125]);
      expect(h.state.downloading, isFalse);
      expect(h.storage.values.values, isNot(contains('{}')));
    },
  );

  test(
    'token transport failure unlocks busy state, preserves the session and requires a fresh check',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.refresh();
      h.tokenFailure = true;
      h.container.invalidate(jwtProvider);
      await h.controller.export();
      expect(h.state.exportStatus, ExportStatus.failed);
      expect(h.state.canRequestExport, isFalse);
      expect(h.state.refreshing, isFalse);
      expect(h.state.error, contains('check your session'));
      expect(h.signOuts, 0);
      expect(h.api.exportCalls, 0);
      h.tokenFailure = false;
      h.container.invalidate(jwtProvider);
      await h.refresh();
      expect(h.state.canRequestExport, isTrue);
      expect(h.state.error, isNull);
      await h.controller.export();
      expect(h.api.exportCalls, 1);
      expect(h.state.exportStatus, ExportStatus.received);
    },
  );
}

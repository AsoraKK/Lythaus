import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'test_doubles.dart';

void main() {
  /// Focus on edge cases not already covered by privacy_controller_test.dart

  group('PrivacyController cooldown edge cases', () {
    test('debugTickCooldown expiring cooldown transitions to idle', () async {
      final harness = _Harness(
        initialCooldown: const Duration(minutes: 5),
        now: DateTime.utc(2024, 1, 2, 12), // after the cooldown window
        lastExportAt: DateTime.utc(2024, 1, 1, 0),
      );
      addTearDown(harness.dispose);

      final c = await harness.controller();
      c.debugTickCooldown();

      expect(c.state.exportStatus, ExportStatus.idle);
      expect(c.state.remainingCooldown, Duration.zero);
    });

    test(
      'debugTickCooldown with null lastExportAt transitions to idle',
      () async {
        final harness = _Harness(
          initialCooldown: const Duration(minutes: 10),
          lastExportAt: null,
        );
        addTearDown(harness.dispose);

        final c = await harness.controller();
        // Override state to have no lastExportAt but still be coolingDown
        c.state = c.state.copyWith(
          exportStatus: ExportStatus.coolingDown,
          remainingCooldown: const Duration(minutes: 10),
        );
        // Remove the lastExportAt by setting it via copyWith (it preserves null)
        c.debugTickCooldown();

        expect(c.state.exportStatus, ExportStatus.idle);
        expect(c.state.remainingCooldown, Duration.zero);
      },
    );

    test(
      'debugTickCooldown with remaining time > 0 stays coolingDown',
      () async {
        final lastExport = DateTime.utc(2024, 1, 1, 11);
        final now = DateTime.utc(2024, 1, 1, 12); // 1h after export
        final harness = _Harness(
          initialCooldown: const Duration(hours: 23),
          lastExportAt: lastExport,
          now: now,
        );
        addTearDown(harness.dispose);

        final c = await harness.controller();
        c.debugTickCooldown();

        // 24h - 1h = 23h remaining
        expect(c.state.exportStatus, ExportStatus.coolingDown);
        expect(c.state.remainingCooldown.inHours, greaterThan(0));
      },
    );
  });

  group('PrivacyController delete failure', () {
    test('delete failure with unauthorized triggers sign-out', () async {
      final harness = _Harness(
        initialCooldown: Duration.zero,
        deleteError: const PrivacyException(
          PrivacyErrorType.unauthorized,
          'Expired',
        ),
      );
      addTearDown(harness.dispose);

      final c = await harness.controller();
      await c.delete();

      expect(c.state.deleteStatus, DeleteStatus.failed);
      expect(harness.signOutCalls, greaterThan(0));
    });

    test('delete failure with server error shows error', () async {
      final harness = _Harness(
        initialCooldown: Duration.zero,
        deleteError: const PrivacyException(
          PrivacyErrorType.server,
          'Server down',
        ),
      );
      addTearDown(harness.dispose);

      final c = await harness.controller();
      await c.delete();

      expect(c.state.deleteStatus, DeleteStatus.failed);
      expect(c.state.error, 'Server down');
    });
  });

  group('PrivacyController export edge cases', () {
    test('export skipped when not canRequestExport and not failed', () async {
      final harness = _Harness(initialCooldown: const Duration(hours: 10));
      addTearDown(harness.dispose);

      final c = await harness.controller();
      // State has coolingDown and cooldown > 0, so canRequestExport is false
      await c.export();

      // export should not have been called — status stays coolingDown
      expect(c.state.exportStatus, ExportStatus.coolingDown);
    });

    test('export allowed when exportStatus is failed', () async {
      final harness = _Harness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.exportSnapshot = const ExportSnapshot(
        remainingCooldown: Duration(hours: 24),
        serverState: 'accepted',
      );

      final c = await harness.controller();
      // Force failed state
      c.state = c.state.copyWith(exportStatus: ExportStatus.failed);
      await c.export();

      expect(c.state.exportStatus, ExportStatus.coolingDown);
    });

    test('export with network error and no retryAfter', () async {
      final harness = _Harness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.exportError = const PrivacyException(
        PrivacyErrorType.network,
        'No connection',
      );

      final c = await harness.controller();
      await c.export();

      expect(c.state.exportStatus, ExportStatus.failed);
      expect(c.state.error, 'No connection');
    });
  });

  group('PrivacyController refreshStatus edge cases', () {
    test('refreshStatus unauthorized triggers sign-out', () async {
      final harness = _Harness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.statusError = const PrivacyException(
        PrivacyErrorType.unauthorized,
        'Expired',
      );

      final c = await harness.controller();
      await c.refreshStatus();

      expect(harness.signOutCalls, greaterThan(0));
    });

    test('refreshStatus with no cooldown cancels ticker', () async {
      final harness = _Harness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.statusSnapshot = const ExportSnapshot(
        remainingCooldown: Duration.zero,
        serverState: 'idle',
      );

      final c = await harness.controller();
      await c.refreshStatus();

      expect(c.state.exportStatus, ExportStatus.idle);
      expect(c.state.remainingCooldown, Duration.zero);
    });
  });

  group('PrivacyState', () {
    test('canRequestExport when idle and no cooldown', () {
      const s = PrivacyState();
      expect(s.canRequestExport, isTrue);
    });

    test('canRequestExport false when coolingDown', () {
      const s = PrivacyState(
        exportStatus: ExportStatus.coolingDown,
        remainingCooldown: Duration(hours: 1),
      );
      expect(s.canRequestExport, isFalse);
    });

    test('canRequestExport true when failed and no cooldown', () {
      const s = PrivacyState(exportStatus: ExportStatus.failed);
      expect(s.canRequestExport, isTrue);
    });

    test('isCoolingDown true when appropriate', () {
      const s = PrivacyState(
        exportStatus: ExportStatus.coolingDown,
        remainingCooldown: Duration(minutes: 30),
      );
      expect(s.isCoolingDown, isTrue);
    });

    test('isCoolingDown false when status idle', () {
      const s = PrivacyState(remainingCooldown: Duration(minutes: 30));
      expect(s.isCoolingDown, isFalse);
    });

    test('hasLastExport', () {
      const s1 = PrivacyState();
      expect(s1.hasLastExport, isFalse);

      final s2 = PrivacyState(lastExportAt: DateTime(2024));
      expect(s2.hasLastExport, isTrue);
    });

    test('copyWith preserves and overrides', () {
      final s = PrivacyState(
        exportStatus: ExportStatus.requesting,
        deleteStatus: DeleteStatus.confirming,
        lastExportAt: DateTime(2024),
        remainingCooldown: const Duration(hours: 1),
        error: 'err',
      );

      final copy = s.copyWith(
        exportStatus: ExportStatus.idle,
        clearError: true,
      );
      expect(copy.exportStatus, ExportStatus.idle);
      expect(copy.deleteStatus, DeleteStatus.confirming);
      expect(copy.error, isNull);
      expect(copy.remainingCooldown, const Duration(hours: 1));
    });
  });
}

class _Harness {
  _Harness({
    required Duration initialCooldown,
    DateTime? lastExportAt,
    DateTime? now,
    String token = 'token',
    PrivacyException? deleteError,
  }) : _now = now ?? DateTime.utc(2024, 1, 1, 12),
       repository = _TestRepository(
         snapshot: ExportSnapshot(
           remainingCooldown: initialCooldown,
           lastExportAt: lastExportAt,
           serverState: initialCooldown > Duration.zero ? 'queued' : null,
         ),
         deleteError: deleteError,
         clock: () => now ?? DateTime.utc(2024, 1, 1, 12),
       ) {
    container = ProviderContainer(
      overrides: [
        appLoggerProvider.overrideWithValue(AppLogger('priv_test')),
        jwtProvider.overrideWith((ref) => Future.value(token)),
        privacyRepositoryProvider.overrideWithValue(repository),
        privacyControllerProvider.overrideWith((ref) {
          return PrivacyController(
            ref: ref,
            repository: repository,
            logger: ref.watch(appLoggerProvider),
            analyticsClient: const NullAnalyticsClient(),
            clock: () => _now,
            onSignOut: () async => signOutCalls++,
          );
        }),
      ],
    );
    subscription = container.listen(
      privacyControllerProvider,
      (_, __) {},
      fireImmediately: true,
    );
  }

  final DateTime _now;
  final _TestRepository repository;
  late final ProviderContainer container;
  late final ProviderSubscription<PrivacyState> subscription;
  int signOutCalls = 0;

  Future<PrivacyController> controller() async {
    final c = container.read(privacyControllerProvider.notifier);
    await Future<void>.delayed(Duration.zero);
    return c;
  }

  void dispose() {
    subscription.close();
    container.dispose();
  }
}

class _TestRepository extends PrivacyRepository {
  _TestRepository({
    required this.snapshot,
    this.deleteError,
    required DateTime Function() clock,
  }) : super(
         api: TestPrivacyApi(),
         storage: NullSecureStorage(),
         logger: AppLogger('test_repo'),
         clock: clock,
       );

  final ExportSnapshot snapshot;
  ExportSnapshot? exportSnapshot;
  ExportSnapshot? statusSnapshot;
  PrivacyException? exportError;
  PrivacyException? statusError;
  final PrivacyException? deleteError;

  @override
  Duration get cooldownWindow => const Duration(hours: 24);

  @override
  Future<ExportSnapshot> loadPersistedSnapshot() async => snapshot;

  @override
  Future<ExportSnapshot> fetchRemoteStatus({required String authToken}) async {
    if (statusError != null) throw statusError!;
    return statusSnapshot ?? snapshot;
  }

  @override
  Future<ExportSnapshot> requestExport({required String authToken}) async {
    if (exportError != null) throw exportError!;
    return exportSnapshot ?? snapshot;
  }

  @override
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {
    if (deleteError != null) throw deleteError!;
  }

  @override
  Future<void> clearPersistedExport() async {}
}

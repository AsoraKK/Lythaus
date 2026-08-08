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
  group('PrivacyController', () {
    test('hydrates from repository snapshot', () async {
      final harness = _ControllerHarness(
        initialCooldown: const Duration(hours: 1),
      );
      addTearDown(harness.dispose);

      final controller = await harness.controller();
      expect(controller.state.exportStatus, ExportStatus.coolingDown);
      expect(controller.state.remainingCooldown, const Duration(hours: 1));
    });

    test('export success enters cooldown and clears error', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.exportSnapshot = const ExportSnapshot(
        remainingCooldown: Duration(hours: 24),
        serverState: 'accepted',
      );

      final controller = await harness.controller();
      await controller.export();

      expect(controller.state.exportStatus, ExportStatus.coolingDown);
      expect(controller.state.remainingCooldown, const Duration(hours: 24));
    });

    test(
      'export handles rate limited error and starts cooldown timer',
      () async {
        final harness = _ControllerHarness(initialCooldown: Duration.zero);
        addTearDown(harness.dispose);
        harness.repository.exportError = const PrivacyException(
          PrivacyErrorType.rateLimited,
          'Too many',
          retryAfter: Duration(hours: 2),
        );

        final controller = await harness.controller();
        await controller.export();

        expect(controller.state.exportStatus, ExportStatus.failed);
        expect(controller.state.remainingCooldown, const Duration(hours: 2));
      },
    );

    test(
      'delete success marks the request submitted without signing out',
      () async {
        final harness = _ControllerHarness(initialCooldown: Duration.zero);
        addTearDown(harness.dispose);

        final controller = await harness.controller();
        await controller.delete();

        expect(controller.state.deleteStatus, DeleteStatus.requested);
        expect(harness.signOutCalls, 0);
      },
    );

    test('begin and cancel delete confirmation toggle state', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      final controller = await harness.controller();

      controller.beginDeleteConfirmation();
      expect(controller.state.deleteStatus, DeleteStatus.confirming);

      controller.cancelDeleteConfirmation();
      expect(controller.state.deleteStatus, DeleteStatus.idle);
    });

    test('clearError resets error field', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      final controller = await harness.controller();

      controller.state = controller.state.copyWith(
        exportStatus: ExportStatus.failed,
        error: 'oops',
      );
      controller.clearError();

      expect(controller.state.error, isNull);
    });

    test('refreshStatus applies snapshot from repository', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.statusSnapshot = const ExportSnapshot(
        remainingCooldown: Duration(minutes: 30),
        serverState: 'queued',
      );

      final controller = await harness.controller();
      await controller.refreshStatus();

      expect(controller.state.exportStatus, ExportStatus.coolingDown);
      expect(controller.state.remainingCooldown, const Duration(minutes: 30));
    });

    test('refreshStatus handles repository errors', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.statusError = const PrivacyException(
        PrivacyErrorType.rateLimited,
        'Busy',
        retryAfter: Duration(minutes: 5),
      );

      final controller = await harness.controller();
      await controller.refreshStatus();

      expect(controller.state.exportStatus, ExportStatus.failed);
      expect(controller.state.remainingCooldown, const Duration(minutes: 5));
    });

    test('export unauthorized triggers sign-out flow', () async {
      final harness = _ControllerHarness(initialCooldown: Duration.zero);
      addTearDown(harness.dispose);
      harness.repository.exportError = const PrivacyException(
        PrivacyErrorType.unauthorized,
        'Session expired',
      );

      final controller = await harness.controller();
      await controller.export();

      expect(harness.signOutCalls, greaterThan(0));
      expect(controller.state.error, 'Session expired. Please sign in.');
    });

    test('handles missing auth token by signing out', () async {
      final harness = _ControllerHarness(
        initialCooldown: Duration.zero,
        token: '',
      );
      addTearDown(harness.dispose);

      final controller = await harness.controller();
      await controller.export();

      expect(harness.signOutCalls, greaterThan(0));
      expect(controller.state.exportStatus, ExportStatus.failed);
    });
  });
}

class _ControllerHarness {
  _ControllerHarness({
    required Duration initialCooldown,
    String token = 'token',
  }) : now = DateTime.utc(2024, 1, 1, 12),
       repository = _ControllerRepository(
         snapshot: ExportSnapshot(
           remainingCooldown: initialCooldown,
           serverState: initialCooldown > Duration.zero ? 'queued' : 'idle',
         ),
         clock: () => DateTime.utc(2024, 1, 1, 12),
       ),
       _token = token {
    container = ProviderContainer(
      overrides: [
        appLoggerProvider.overrideWithValue(AppLogger('controller_test')),
        jwtProvider.overrideWith((ref) => Future.value(_token)),
        privacyRepositoryProvider.overrideWithValue(repository),
        privacyControllerProvider.overrideWith((ref) {
          final logger = ref.watch(appLoggerProvider);
          return PrivacyController(
            ref: ref,
            repository: repository,
            logger: logger,
            analyticsClient: const NullAnalyticsClient(),
            clock: () => now,
            onSignOut: () async {
              signOutCalls++;
            },
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

  final DateTime now;
  final _ControllerRepository repository;
  late final ProviderContainer container;
  late final ProviderSubscription<PrivacyState> subscription;
  int signOutCalls = 0;
  final String _token;

  Future<PrivacyController> controller() async {
    final notifier = container.read(privacyControllerProvider.notifier);
    await Future<void>.delayed(Duration.zero);
    return notifier;
  }

  void dispose() {
    subscription.close();
    container.dispose();
  }
}

class _ControllerRepository extends PrivacyRepository {
  _ControllerRepository({
    required this.snapshot,
    required DateTime Function() clock,
  }) : super(
         api: TestPrivacyApi(),
         storage: NullSecureStorage(),
         logger: AppLogger('controller_repo'),
         clock: clock,
       );

  final ExportSnapshot snapshot;
  ExportSnapshot? exportSnapshot;
  ExportSnapshot? statusSnapshot;
  PrivacyException? exportError;
  PrivacyException? statusError;

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
  }) async {}

  @override
  Future<void> clearPersistedExport() async {}
}

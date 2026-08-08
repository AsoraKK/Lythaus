import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/features/privacy/services/privacy_repository.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:lythaus/features/privacy/widgets/privacy_blocking_overlay.dart';
import 'package:lythaus/features/privacy/widgets/privacy_error_banner.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'test_doubles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PrivacySettingsScreen', () {
    testWidgets('disables export button during cooldown', (tester) async {
      final harness = _buildHarness(
        state: PrivacyState(
          exportStatus: ExportStatus.coolingDown,
          remainingCooldown: const Duration(hours: 2, minutes: 30),
          lastExportAt: DateTime.utc(2024, 1, 1, 8),
        ),
      );

      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      expect(find.text('Try again in 02:30'), findsOneWidget);
      final button = tester.widget<LythButton>(
        find.byWidgetPredicate(
          (widget) =>
              widget is LythButton && widget.label.startsWith('Try again in'),
        ),
      );
      expect(button.onPressed, isNull);
    });

    testWidgets('delete dialog requires typing DELETE', (tester) async {
      final harness = _buildHarness(state: const PrivacyState());
      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      // Scroll to find the delete button (it's now below AnalyticsSettingsCard)
      await tester.dragUntilVisible(
        find.text('Request account deletion'),
        find.byType(ListView),
        const Offset(0, -100),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Request account deletion'));
      await tester.pumpAndSettle();

      final confirmButton = find.byWidgetPredicate(
        (widget) => widget is LythButton && widget.label == 'Delete',
      );
      expect(tester.widget<LythButton>(confirmButton).onPressed, isNull);

      await tester.enterText(find.byType(LythTextField), 'DELETE');
      await tester.pump();

      expect(tester.widget<LythButton>(confirmButton).onPressed, isNotNull);
    });

    testWidgets('countdown label updates after tick', (tester) async {
      final harness = _buildHarness(
        state: const PrivacyState(
          exportStatus: ExportStatus.coolingDown,
          remainingCooldown: Duration(hours: 1, minutes: 1),
          lastExportAt: null,
        ),
        initialNow: DateTime.utc(2024, 1, 2, 11),
      );

      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();
      expect(find.text('Try again in 01:01'), findsOneWidget);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(PrivacySettingsScreen)),
      );
      final controller = container.read(privacyControllerProvider.notifier);

      harness.clock.value = harness.clock.value.add(const Duration(minutes: 1));
      controller.debugTickCooldown();
      await tester.pumpAndSettle();

      expect(controller.state.remainingCooldown, const Duration(hours: 1));
      expect(find.textContaining('Try again in 01:00'), findsOneWidget);
    });

    testWidgets('shows error banner when controller reports failure', (
      tester,
    ) async {
      final harness = _buildHarness(state: const PrivacyState());

      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(PrivacySettingsScreen)),
      );
      final controller = container.read(privacyControllerProvider.notifier);
      controller.state = controller.state.copyWith(
        exportStatus: ExportStatus.failed,
        error: 'Something went wrong',
      );
      await tester.pump();

      expect(find.byType(PrivacyErrorBanner), findsOneWidget);
    });

    testWidgets('shows blocking overlay while deleting', (tester) async {
      final harness = _buildHarness(state: const PrivacyState());

      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(PrivacySettingsScreen)),
      );
      final controller = container.read(privacyControllerProvider.notifier);
      controller.state = controller.state.copyWith(
        deleteStatus: DeleteStatus.deleting,
      );
      await tester.pump();

      expect(find.byType(PrivacyBlockingOverlay), findsOneWidget);
    });

    testWidgets('shows export request submitted snackbar', (tester) async {
      final harness = _buildHarness(state: const PrivacyState());
      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(PrivacySettingsScreen)),
      );
      final controller = container.read(privacyControllerProvider.notifier);

      controller.state = controller.state.copyWith(
        exportStatus: ExportStatus.accepted,
      );
      await tester.pump();

      expect(
        find.text(
          'Export request submitted. Refresh this page to track processing.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('keeps the session active when deletion is submitted', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = _buildHarness(state: const PrivacyState());
      await tester.pumpWidget(harness.widget);
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(PrivacySettingsScreen)),
      );
      final controller = container.read(privacyControllerProvider.notifier);

      controller.state = controller.state.copyWith(
        deleteStatus: DeleteStatus.requested,
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Deletion request submitted. Your account remains available while the request is processed.',
        ),
        findsOneWidget,
      );
      expect(find.byType(PrivacySettingsScreen), findsOneWidget);
    });
  });
}

class _Harness {
  _Harness(this.widget, this.clock);

  final Widget widget;
  final ValueNotifier<DateTime> clock;
}

_Harness _buildHarness({required PrivacyState state, DateTime? initialNow}) {
  final now = ValueNotifier<DateTime>(
    initialNow ?? DateTime.utc(2024, 1, 1, 12),
  );
  final derivedLastExport =
      state.lastExportAt ??
      (state.remainingCooldown > Duration.zero
          ? now.value.subtract(
              const Duration(hours: 24) - state.remainingCooldown,
            )
          : null);
  final snapshot = ExportSnapshot(
    lastExportAt: derivedLastExport,
    remainingCooldown: state.remainingCooldown,
    serverState: state.exportStatus.name,
  );
  final repository = _TestRepository(snapshot, () => now.value);

  final overrides = <Override>[
    appLoggerProvider.overrideWithValue(AppLogger('test')),
    jwtProvider.overrideWith((ref) => Future.value('token')),
    privacyRepositoryProvider.overrideWithValue(repository),
    privacyControllerProvider.overrideWith((ref) {
      final logger = ref.watch(appLoggerProvider);
      return PrivacyController(
        ref: ref,
        repository: repository,
        logger: logger,
        analyticsClient: const NullAnalyticsClient(),
        clock: () => now.value,
      );
    }),
  ];

  final widget = ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: PrivacySettingsScreen()),
  );

  return _Harness(widget, now);
}

class _TestRepository extends PrivacyRepository {
  _TestRepository(this.snapshot, DateTime Function() clock)
    : super(
        api: TestPrivacyApi(),
        storage: NullSecureStorage(),
        logger: AppLogger('repo_test'),
        clock: clock,
      );

  final ExportSnapshot snapshot;

  @override
  Future<ExportSnapshot> loadPersistedSnapshot() async => snapshot;

  @override
  Future<ExportSnapshot> fetchRemoteStatus({required String authToken}) async =>
      snapshot;

  @override
  Future<ExportSnapshot> requestExport({required String authToken}) async =>
      snapshot;

  @override
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {}
}

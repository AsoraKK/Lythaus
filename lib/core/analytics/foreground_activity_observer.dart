// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';

class ForegroundActivityObserver extends ConsumerStatefulWidget {
  const ForegroundActivityObserver({
    required this.child,
    this.clock,
    super.key,
  });
  final Widget child;
  final DateTime Function()? clock;
  @override
  ConsumerState<ForegroundActivityObserver> createState() =>
      _ForegroundActivityObserverState();
}

class _ForegroundActivityObserverState
    extends ConsumerState<ForegroundActivityObserver>
    with WidgetsBindingObserver {
  bool _scheduled = false;
  bool _forceSignal = false;
  String? _observedDay;
  ProviderSubscription<ActivityMeasurementState>? _subscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (ref.read(activityPilotEnabledProvider)) {
      _subscription = ref.listenManual(activityMeasurementControllerProvider, (
        previous,
        next,
      ) {
        if (next.consent?.granted == true &&
            !next.loading &&
            !next.saving &&
            !next.paused &&
            (previous?.consent?.epoch != next.consent?.epoch ||
                previous?.loading == true ||
                previous?.saving == true ||
                previous?.paused == true)) {
          _scheduleVisibleFrame(force: true);
        }
      });
      _scheduleVisibleFrame(force: true);
    }
  }

  void _scheduleVisibleFrame({bool force = false, bool requestFrame = true}) {
    if (!mounted || !ref.read(activityPilotEnabledProvider)) {
      return;
    }
    _forceSignal = _forceSignal || force;
    if (_scheduled) {
      if (requestFrame) WidgetsBinding.instance.scheduleFrame();
      return;
    }
    final revision = ref.read(authSessionRevisionProvider);
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!mounted ||
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      final currentRevision = ref.read(authSessionRevisionProvider);
      final controller = ref.read(
        activityMeasurementControllerProvider.notifier,
      );
      final day = (widget.clock?.call() ?? DateTime.now())
          .toUtc()
          .toIso8601String()
          .substring(0, 10);
      final key =
          '$day:$currentRevision:${ref.read(activityMeasurementControllerProvider).consent?.epoch}';
      if (currentRevision == revision &&
          controller.canCollect &&
          (_forceSignal || _observedDay != key)) {
        _forceSignal = false;
        _observedDay = key;
        unawaited(controller.visibleForegroundRender());
      }
      // Observe the next naturally rendered frame. This does not request a
      // frame, start a timer or create a heartbeat while the app is idle.
      _scheduleVisibleFrame(requestFrame: false);
    });
    if (requestFrame) WidgetsBinding.instance.scheduleFrame();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _scheduleVisibleFrame(force: true);
  }

  @override
  void dispose() {
    _subscription?.close();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';

class ForegroundActivityObserver extends ConsumerStatefulWidget {
  const ForegroundActivityObserver({required this.child, super.key});
  final Widget child;
  @override
  ConsumerState<ForegroundActivityObserver> createState() =>
      _ForegroundActivityObserverState();
}

class _ForegroundActivityObserverState
    extends ConsumerState<ForegroundActivityObserver>
    with WidgetsBindingObserver {
  bool _scheduled = false;
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
                previous?.saving == true)) {
          _scheduleVisibleFrame();
        }
      });
      _scheduleVisibleFrame();
    }
  }

  void _scheduleVisibleFrame() {
    if (_scheduled || !mounted || !ref.read(activityPilotEnabledProvider)) {
      return;
    }
    final revision = ref.read(authSessionRevisionProvider);
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!mounted ||
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
          ref.read(authSessionRevisionProvider) != revision) {
        return;
      }
      unawaited(
        ref
            .read(activityMeasurementControllerProvider.notifier)
            .visibleForegroundRender(),
      );
    });
    WidgetsBinding.instance.scheduleFrame();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _scheduleVisibleFrame();
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

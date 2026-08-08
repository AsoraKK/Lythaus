// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/scheduler.dart';

import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/core/routing/url_strategy.dart';
import 'package:lythaus/core/config/web_release_guard.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/observability/crash_reporting.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureAppUrlStrategy();
  if (isReleaseWebBuild) {
    requirePublicHttpsOrigin(
      'AUTH_URL',
      const String.fromEnvironment('AUTH_URL', defaultValue: ''),
    );
    requirePublicHttpsOrigin(
      'API_BASE_URL',
      const String.fromEnvironment('API_BASE_URL', defaultValue: ''),
    );
  }
  final crashReporting = CrashReportingService(
    sink: FirebaseCrashSink(),
    logger: AppLogger('CrashReporting'),
  );
  await crashReporting.initialize();
  runApp(const ProviderScope(child: LythausApp()));
}

class LythausApp extends ConsumerStatefulWidget {
  const LythausApp({super.key});

  @override
  ConsumerState<LythausApp> createState() => _LythausAppState();
}

class _LythausAppState extends ConsumerState<LythausApp> {
  bool _appStartedLogged = false;
  ProviderSubscription<AsyncValue<User?>>? _authStateSub;

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appStartedLogged) return;
      final analytics = ref.read(analyticsClientProvider);
      analytics.logEvent(AnalyticsEvents.appStarted);
      ref
          .read(analyticsEventTrackerProvider)
          .logEventOnce(analytics, AnalyticsEvents.onboardingStart);
      _appStartedLogged = true;
    });

    _authStateSub = ref.listenManual<AsyncValue<User?>>(authStateProvider, (
      previous,
      next,
    ) {
      final analytics = ref.read(analyticsClientProvider);
      final user = next.valueOrNull;
      analytics.setUserId(user?.id);
    });
  }

  @override
  void dispose() {
    _authStateSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'Lythaus',
      theme: LythausTheme.light(),
      darkTheme: LythausTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}

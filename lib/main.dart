// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/foreground_activity_observer.dart';
import 'package:flutter/scheduler.dart';

import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/core/routing/url_strategy.dart';
import 'package:lythaus/core/config/web_release_guard.dart';
import 'package:lythaus/core/config/web_release_reload_gate.dart';
import 'package:lythaus/core/config/web_release_update_bridge.dart';
import 'package:lythaus/core/config/startup_presentation.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/observability/crash_reporting.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/core/network/pending_authenticated_operations.dart';

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
  bool _startupPresented = false;
  ProviderSubscription<AsyncValue<User?>>? _authStateSub;
  ProviderSubscription<int>? _authSessionRevisionSub;
  ProviderSubscription<ContentMutationRegistry>? _contentMutationSub;
  ProviderSubscription<PendingAuthenticatedOperations>? _pendingOperationsSub;
  ProviderSubscription<PostCreationState>? _postCreationSub;
  WebReleaseReloadGate? _reloadGate;

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
      _dismissStartupWhenReady();
    });

    _authStateSub = ref.listenManual<AsyncValue<User?>>(authStateProvider, (
      previous,
      next,
    ) {
      final analytics = ref.read(analyticsClientProvider);
      final user = next.valueOrNull;
      analytics.setUserId(user?.id);
      _scheduleReloadSafetySync();
      if (!next.isLoading) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          _dismissStartupWhenReady();
        });
      }
    });

    // The registry must observe account transitions on every platform so
    // sign-out can clear account-bound recovery drafts even when the app
    // starts on a route that never opens feed content. Read it without
    // watching: registry changes must not rebuild the app root.
    final contentMutationRegistry = ref.read(contentMutationRegistryProvider);

    if (isReleaseWebBuild) {
      _reloadGate = WebReleaseReloadGate(
        registry: contentMutationRegistry,
        authSessionRevision: () => ref.read(authSessionRevisionProvider),
        authLoading: () => ref.read(authStateProvider).isLoading,
        hasPendingAuthenticatedWork: () =>
            ref.read(pendingAuthenticatedOperationsProvider).hasPending,
        postCanSafelyReload: () =>
            ref.read(postCreationProvider).canSafelyReload,
        hasFocusedTextEntry: _hasFocusedTextEntry,
        setCanReload: setWebReleaseCanReload,
      );
      FocusManager.instance.addListener(_scheduleReloadSafetySync);
      _contentMutationSub = ref.listenManual(
        contentMutationRegistryProvider,
        (_, _) => _scheduleReloadSafetySync(),
      );
      _pendingOperationsSub = ref.listenManual(
        pendingAuthenticatedOperationsProvider,
        (_, _) => _scheduleReloadSafetySync(),
      );
      _postCreationSub = ref.listenManual(
        postCreationProvider,
        (_, _) => _scheduleReloadSafetySync(),
      );
      _authSessionRevisionSub = ref.listenManual(
        authSessionRevisionProvider,
        (_, _) => _scheduleReloadSafetySync(),
      );
      ref.read(postCreationProvider);
      _scheduleReloadSafetySync();
    }
  }

  @override
  void dispose() {
    _reloadGate?.dispose();
    _authSessionRevisionSub?.close();
    _contentMutationSub?.close();
    _pendingOperationsSub?.close();
    _postCreationSub?.close();
    if (isReleaseWebBuild) {
      FocusManager.instance.removeListener(_scheduleReloadSafetySync);
    }
    _authStateSub?.close();
    super.dispose();
  }

  void _scheduleReloadSafetySync() {
    if (!isReleaseWebBuild || !mounted) return;
    final sync = _reloadGate?.schedule();
    if (sync != null) unawaited(sync);
  }

  void _dismissStartupWhenReady() {
    if (!mounted ||
        _startupPresented ||
        ref.read(authStateProvider).isLoading) {
      return;
    }
    _startupPresented = true;
    dismissStartupPresentation();
  }

  bool _hasFocusedTextEntry() {
    final focusedContext = FocusManager.instance.primaryFocus?.context;
    return focusedContext?.findAncestorWidgetOfExactType<EditableText>() !=
        null;
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    return ForegroundActivityObserver(
      child: MaterialApp.router(
        title: 'Lythaus',
        theme: LythausTheme.light(),
        darkTheme: LythausTheme.dark(),
        themeMode: ThemeMode.system,
        routerConfig: router,
      ),
    );
  }
}

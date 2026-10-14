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
import 'package:lythaus/core/config/web_release_update_bridge.dart';
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
  ProviderSubscription<AsyncValue<User?>>? _authStateSub;
  ProviderSubscription<int>? _authSessionRevisionSub;
  ProviderSubscription<ContentMutationRegistry>? _contentMutationSub;
  ProviderSubscription<PendingAuthenticatedOperations>? _pendingOperationsSub;
  ProviderSubscription<PostCreationState>? _postCreationSub;
  int _reloadSafetyRevision = 0;

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
      _scheduleReloadSafetySync();
    });

    if (isReleaseWebBuild) {
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
    _reloadSafetyRevision++;
    _authSessionRevisionSub?.close();
    _contentMutationSub?.close();
    _pendingOperationsSub?.close();
    _postCreationSub?.close();
    if (isReleaseWebBuild) {
      FocusManager.instance.removeListener(_scheduleReloadSafetySync);
      setWebReleaseCanReload(false);
    }
    _authStateSub?.close();
    super.dispose();
  }

  void _scheduleReloadSafetySync() {
    if (!isReleaseWebBuild || !mounted) return;
    setWebReleaseCanReload(false);
    final revision = ++_reloadSafetyRevision;
    unawaited(_syncReloadSafety(revision));
  }

  Future<void> _syncReloadSafety(int revision) async {
    final registry = ref.read(contentMutationRegistryProvider);
    final authRevision = ref.read(authSessionRevisionProvider);
    final registryEpoch = registry.sessionEpoch;
    try {
      await registry.flushPendingJournalWrites().timeout(
        const Duration(seconds: 5),
      );
    } catch (_) {
      return;
    }
    if (!mounted ||
        revision != _reloadSafetyRevision ||
        authRevision != ref.read(authSessionRevisionProvider) ||
        registryEpoch != registry.sessionEpoch) {
      return;
    }

    final authState = ref.read(authStateProvider);
    final postState = ref.read(postCreationProvider);
    final focusedContext = FocusManager.instance.primaryFocus?.context;
    final hasFocusedTextEntry =
        focusedContext?.findAncestorWidgetOfExactType<EditableText>() != null;
    final canReload =
        !authState.isLoading &&
        !hasFocusedTextEntry &&
        registry.canSafelyReload &&
        !ref.read(pendingAuthenticatedOperationsProvider).hasPending &&
        postState.canSafelyReload;
    setWebReleaseCanReload(canReload);
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(contentMutationRegistryProvider);
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

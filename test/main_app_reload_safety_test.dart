import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/analytics/foreground_activity_observer.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/main.dart';
import 'package:mocktail/mocktail.dart';
import 'helpers/content_recovery.dart';

class _MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    with Mock
    implements AuthStateNotifier {
  _MockAuthStateNotifier({User? user}) : super(AsyncValue.data(user));
}

class _TrackingRecoveryStorage extends MemoryContentRecoveryStorage {
  final clearedAccount = Completer<void>();
  bool trackClearedAccount = false;

  @override
  Future<void> write(String key, String value) async {
    await super.write(key, value);
    final data = jsonDecode(value) as Map<String, dynamic>;
    if (trackClearedAccount &&
        (data['drafts'] as Map).isEmpty &&
        !clearedAccount.isCompleted) {
      clearedAccount.complete();
    }
  }
}

class _FakeAnalyticsEventTracker implements AnalyticsEventTracker {
  @override
  Future<bool> logEventOnce(
    AnalyticsClient client,
    String eventName, {
    String? userId,
    Map<String, Object?>? properties,
  }) async => true;

  @override
  Future<bool> wasLogged(String eventName, {String? userId}) async => false;
}

class _ReloadBlockingDraft extends StatefulWidget {
  const _ReloadBlockingDraft({required this.registry});

  final ContentMutationRegistry registry;

  @override
  State<_ReloadBlockingDraft> createState() => _ReloadBlockingDraftState();
}

class _ReloadBlockingDraftState extends State<_ReloadBlockingDraft> {
  static const _blockKey = 'app-root-reload-safety-test';

  @override
  void dispose() {
    widget.registry.setReloadBlocked(_blockKey, false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: TextField(
        key: const ValueKey('reload-blocking-draft'),
        onChanged: (value) =>
            widget.registry.setReloadBlocked(_blockKey, value.isNotEmpty),
      ),
    );
  }
}

void main() {
  User signedInUser() => User(
    id: 'account-a',
    email: 'synthetic@example.invalid',
    role: UserRole.user,
    tier: UserTier.bronze,
    reputationScore: 0,
    createdAt: DateTime.utc(2026),
    lastLoginAt: DateTime.utc(2026),
  );

  testWidgets(
    'app root keeps its router subtree stable when reload safety changes',
    (tester) async {
      final registry = ContentMutationRegistry();
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                _ReloadBlockingDraft(registry: registry),
          ),
        ],
      );
      addTearDown(() {
        router.dispose();
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appRouterProvider.overrideWithValue(router),
            authStateProvider.overrideWith((ref) => _MockAuthStateNotifier()),
            analyticsClientProvider.overrideWithValue(
              const NullAnalyticsClient(),
            ),
            analyticsEventTrackerProvider.overrideWithValue(
              _FakeAnalyticsEventTracker(),
            ),
            contentMutationRegistryProvider.overrideWith((ref) => registry),
          ],
          child: const LythausApp(),
        ),
      );
      await tester.pumpAndSettle();
      final routerSubtreeBefore = tester
          .widget<ForegroundActivityObserver>(
            find.byType(ForegroundActivityObserver),
          )
          .child;

      await tester.enterText(
        find.byKey(const ValueKey('reload-blocking-draft')),
        'first unsaved character',
      );
      await tester.pumpAndSettle();

      expect(registry.canSafelyReload, isFalse);
      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(find.text('first unsaved character'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('reload-blocking-draft')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<ForegroundActivityObserver>(
              find.byType(ForegroundActivityObserver),
            )
            .child,
        same(routerSubtreeBefore),
        reason: 'A clean-to-dirty reload block must not rebuild the app root.',
      );
    },
  );

  testWidgets(
    'app root initializes account journal before sign-out on a non-feed route',
    (tester) async {
      final storage = _TrackingRecoveryStorage();
      final seed = ContentMutationRegistry(storage: storage);
      seed.activate('account-a');
      await seed.ready;
      expect(
        await seed.saveDraft('post-create:account-a', {
          'body': 'Private unsent post',
        }),
        isTrue,
      );
      seed.dispose();
      storage.trackClearedAccount = true;

      final authNotifier = _MockAuthStateNotifier(user: signedInUser());
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const Scaffold(body: Text('Non-feed landing route')),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appRouterProvider.overrideWithValue(router),
            authStateProvider.overrideWith((ref) => authNotifier),
            analyticsClientProvider.overrideWithValue(
              const NullAnalyticsClient(),
            ),
            analyticsEventTrackerProvider.overrideWithValue(
              _FakeAnalyticsEventTracker(),
            ),
            contentRecoveryStorageProvider.overrideWithValue(storage),
          ],
          child: const LythausApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Non-feed landing route'), findsOneWidget);
      final journalBeforeSignOut =
          jsonDecode(storage.values.values.single) as Map;
      expect(journalBeforeSignOut['drafts'], isNotEmpty);
      expect(storage.clearedAccount.isCompleted, isFalse);

      authNotifier.state = const AsyncValue.data(null);
      await tester.pump();
      await storage.clearedAccount.future.timeout(const Duration(seconds: 2));

      final journal = jsonDecode(storage.values.values.single) as Map;
      expect(journal['drafts'], isEmpty);
      expect(find.text('Non-feed landing route'), findsOneWidget);
    },
  );
}

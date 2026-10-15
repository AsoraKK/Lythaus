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
import 'package:lythaus/main.dart';
import 'package:mocktail/mocktail.dart';

class _MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    with Mock
    implements AuthStateNotifier {
  _MockAuthStateNotifier() : super(const AsyncValue.data(null));
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
}

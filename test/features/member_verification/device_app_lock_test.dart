import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_settings_providers.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';
import 'package:lythaus/features/member_verification/presentation/device_app_lock.dart';
import 'lifecycle_test_support.dart';

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Auth extends AuthService {
  _Auth() : super(authUrl: 'https://api.example.invalid/api');
  int logouts = 0;
  Completer<void>? pendingLogout;
  @override
  Future<User?> getCurrentUser() async => _user('a');
  @override
  Future<bool> validateAndRefreshToken() async => true;
  @override
  Future<void> logout() async {
    logouts++;
    await pendingLogout?.future;
  }
}

class _Store implements DeviceUnlockPreferencesStore {
  final values = <String, DeviceUnlockPreference>{};
  int loads = 0;
  bool fail = false;
  Completer<DeviceUnlockPreference>? pending;
  @override
  Future<DeviceUnlockPreference> load(String id) async {
    loads++;
    if (fail) throw StateError('unavailable');
    return pending?.future ?? values[id] ?? DeviceUnlockPreference.off;
  }

  @override
  Future<void> save(String id, DeviceUnlockPreference preference) async {
    values[id] = preference;
  }
}

class _OS implements DeviceUnlockAuthenticator {
  DeviceUnlockAvailability support = DeviceUnlockAvailability.available;
  DeviceUnlockResult result = DeviceUnlockResult.unlocked;
  Completer<DeviceUnlockResult>? pending;
  int prompts = 0;
  int cancellations = 0;
  @override
  Future<DeviceUnlockAvailability> availability() async => support;
  @override
  Future<DeviceUnlockResult> unlock() async {
    prompts++;
    return pending?.future ?? result;
  }

  @override
  Future<void> cancel() async {
    cancellations++;
  }
}

class _Harness {
  final store = _Store();
  final os = _OS();
  final auth = _Auth();
  late ProviderContainer container;
  int resets = 0;
  bool failNavigation = false;
  Completer<void>? pendingNavigation;
  Completer<String>? dialogResult;
  final navigator = StateProvider<GlobalKey<NavigatorState>>(
    (_) => GlobalKey<NavigatorState>(),
  );
  Future<void> open(WidgetTester tester, {bool enabled = true}) async {
    resumeApp(tester);
    container = ProviderContainer(
      overrides: [
        enhancedAuthServiceProvider.overrideWithValue(auth),
        deviceAppLockEnabledProvider.overrideWithValue(enabled),
        deviceUnlockSettingsEnabledProvider.overrideWithValue(true),
        deviceUnlockPreferencesStoreProvider.overrideWithValue(store),
        deviceUnlockAuthenticatorProvider.overrideWithValue(os),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: Consumer(
          builder: (_, ref, _) => MaterialApp(
            navigatorKey: ref.watch(navigator),
            builder: (_, child) => DeviceAppLock(
              resetPrivateNavigation: () async {
                resets++;
                await pendingNavigation?.future;
                if (failNavigation) {
                  throw StateError('synthetic_navigation_failure');
                }
                container.invalidate(navigator);
                await WidgetsBinding.instance.endOfFrame;
              },
              child: child!,
            ),
            home: Consumer(
              builder: (context, ref, _) => Scaffold(
                body: Column(
                  children: [
                    Text(
                      ref.watch(currentUserProvider) == null
                          ? 'Public browsing'
                          : 'Private account ${ref.watch(currentUserProvider)!.id}',
                    ),
                    TextButton(
                      onPressed: () => showDialog<void>(
                        context: context,
                        builder: (_) => AlertDialog(
                          content: FutureBuilder<String>(
                            future: dialogResult?.future,
                            builder: (_, snapshot) =>
                                Text(snapshot.data ?? 'Private dialog'),
                          ),
                        ),
                      ),
                      child: const Text('Open private dialog'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> openRouter(WidgetTester tester) async {
    resumeApp(tester);
    Widget page(BuildContext context, WidgetRef ref, String location) =>
        Scaffold(
          body: Column(
            children: [
              Text(
                location == '/private'
                    ? 'Private route ${ref.read(currentUserProvider)?.id}'
                    : location == '/public'
                    ? 'Public destination'
                    : ref.watch(currentUserProvider) == null
                    ? 'Public browsing'
                    : 'Private account ${ref.watch(currentUserProvider)!.id}',
              ),
              TextButton(
                onPressed: () => context.push('/private'),
                child: const Text('Open private route'),
              ),
              TextButton(
                onPressed: () {
                  final future = dialogResult?.future;
                  showDialog<void>(
                    context: context,
                    builder: (_) => AlertDialog(
                      content: FutureBuilder<String>(
                        future: future,
                        builder: (_, snapshot) =>
                            Text(snapshot.data ?? 'Private dialog'),
                      ),
                    ),
                  );
                },
                child: const Text('Open private dialog'),
              ),
            ],
          ),
        );
    container = ProviderContainer(
      overrides: [
        enhancedAuthServiceProvider.overrideWithValue(auth),
        deviceAppLockEnabledProvider.overrideWithValue(true),
        deviceUnlockSettingsEnabledProvider.overrideWithValue(true),
        deviceUnlockPreferencesStoreProvider.overrideWithValue(store),
        deviceUnlockAuthenticatorProvider.overrideWithValue(os),
        appRouterProvider.overrideWith((ref) {
          final refresh = ValueNotifier<int>(0);
          ref.listen(authStateProvider, (_, _) => refresh.value++);
          ref.listen(guestModeProvider, (_, _) => refresh.value++);
          final router = GoRouter(
            initialLocation: '/',
            refreshListenable: refresh,
            redirect: (_, state) => resolveAppRedirect(
              matchedLocation: state.matchedLocation,
              user: ref.read(currentUserProvider),
              isGuest: ref.read(guestModeProvider),
              requestedUri: state.uri,
            ),
            routes: [
              for (final path in ['/', '/private', '/public', '/login'])
                GoRoute(
                  path: path,
                  builder: (context, _) => Consumer(
                    builder: (context, ref, _) => page(context, ref, path),
                  ),
                ),
            ],
          );
          ref.onDispose(() {
            router.dispose();
            refresh.dispose();
          });
          return router;
        }),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: Consumer(
          builder: (_, ref, _) => MaterialApp.router(
            routerConfig: ref.watch(appRouterProvider),
            builder: (_, child) => DeviceAppLock(
              resetPrivateNavigation: () async {
                resets++;
                await pendingNavigation?.future;
                if (failNavigation) {
                  throw StateError('synthetic_navigation_failure');
                }
                ref.invalidate(appRouterProvider);
                ref.read(appRouterProvider).go('/');
                await WidgetsBinding.instance.endOfFrame;
              },
              child: child!,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }
}

void main() {
  testWidgets('disabled composition never reads preferences or prompts', (
    tester,
  ) async {
    final h = _Harness();
    await h.open(tester, enabled: false);
    expect(find.text('Private account a'), findsOneWidget);
    expect(h.store.loads, 0);
    expect(h.os.prompts, 0);
  });

  testWidgets('Off keeps browsing available without OS support or network', (
    tester,
  ) async {
    final h = _Harness()..os.support = DeviceUnlockAvailability.unsupported;
    await h.open(tester);
    expect(find.text('Private account a'), findsOneWidget);
    expect(h.os.prompts, 0);
    backgroundApp(tester);
    resumeApp(tester);
    await tester.pumpAndSettle();
    expect(find.text('Private account a'), findsOneWidget);
    expect(h.auth.logouts, 0);
  });

  for (final preference in DeviceUnlockPreference.values.where(
    (p) => p != DeviceUnlockPreference.off,
  )) {
    testWidgets(
      '$preference cold reopen hides private content until OS success',
      (tester) async {
        final h = _Harness()..store.values['a'] = preference;
        await h.open(tester);
        expect(find.text('Private account a'), findsNothing);
        expect(h.os.prompts, 0); // No unsolicited prompt loop.
        await tester.tap(find.text('Unlock with device credentials'));
        await tester.pumpAndSettle();
        expect(find.text('Private account a'), findsOneWidget);
        expect(h.os.prompts, 1);
      },
    );
  }

  testWidgets(
    'every reopen shields existing navigator dialogs and requires deliberate unlock on resume',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      await h.open(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      expect(find.text('Private dialog'), findsOneWidget);
      backgroundApp(tester);
      await tester.pump();
      expect(find.text('Private dialog'), findsNothing);
      resumeApp(tester);
      await tester.pumpAndSettle();
      expect(find.text('Private dialog'), findsNothing);
      expect(h.os.prompts, 1);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      expect(find.text('Private dialog'), findsOneWidget);
      expect(h.auth.logouts, 0);
    },
  );

  for (final result in [
    DeviceUnlockResult.cancelled,
    DeviceUnlockResult.lockedOut,
    DeviceUnlockResult.unavailable,
  ]) {
    testWidgets(
      '$result keeps shield and permits existing guest recovery without changing preference',
      (tester) async {
        final h = _Harness()
          ..store.values['a'] = DeviceUnlockPreference.everyReopen;
        h.os.result = result;
        await h.open(tester);
        await tester.tap(find.text('Unlock with device credentials'));
        await tester.pumpAndSettle();
        expect(find.text('Private account a'), findsNothing);
        expect(find.text('Sign out here and browse as guest'), findsOneWidget);
        await tester.tap(find.text('Sign out here and browse as guest'));
        await tester.pumpAndSettle();
        expect(find.text('Public browsing'), findsOneWidget);
        expect(h.auth.logouts, 1);
        expect(h.store.values['a'], DeviceUnlockPreference.everyReopen);
      },
    );
  }

  testWidgets(
    'private dialog is disposed before locked guest recovery reveals browsing',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      await h.open(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      expect(find.text('Private dialog'), findsOneWidget);
      backgroundApp(tester);
      resumeApp(tester);
      await tester.pumpAndSettle();
      expect(find.text('Private dialog'), findsNothing);
      await tester.tap(find.text('Sign out here and browse as guest'));
      await tester.pumpAndSettle();
      expect(h.container.read(guestModeProvider), isTrue);
      expect(find.text('Private dialog', skipOffstage: false), findsNothing);
      expect(find.text('Public browsing'), findsOneWidget);
    },
  );

  testWidgets(
    'real router guest recovery disposes private route and late dialog result before guest navigation',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      h.dialogResult = Completer<String>();
      await h.openRouter(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private route'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      backgroundApp(tester);
      resumeApp(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out here and browse as guest'));
      await tester.pumpAndSettle();
      expect(find.text('Public browsing'), findsOneWidget);
      expect(find.text('Private dialog', skipOffstage: false), findsNothing);
      expect(find.text('Private route a', skipOffstage: false), findsNothing);
      h.dialogResult!.complete('Late private A result');
      await tester.pumpAndSettle();
      expect(
        find.text('Late private A result', skipOffstage: false),
        findsNothing,
      );
      final resets = h.resets;
      h.container.read(appRouterProvider).go('/public');
      await tester.pumpAndSettle();
      expect(find.text('Public destination'), findsOneWidget);
      expect(h.resets, resets);
      expect(h.container.read(guestModeProvider), isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'A to B Off keeps private route and dialog hidden until the real router is replaced',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      h.dialogResult = Completer<String>();
      await h.openRouter(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private route'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      backgroundApp(tester);
      resumeApp(tester);
      await tester.pumpAndSettle();
      h.pendingNavigation = Completer<void>();
      h.container.read(authStateProvider.notifier).setUser(_user('b'));
      await tester.pump();
      expect(find.text('Private dialog'), findsNothing);
      expect(find.text('Private account b'), findsNothing);
      expect(find.text('Clearing private navigation…'), findsOneWidget);
      h.pendingNavigation!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Private account b'), findsOneWidget);
      expect(find.text('Private dialog', skipOffstage: false), findsNothing);
      expect(find.text('Private route a', skipOffstage: false), findsNothing);
      h.dialogResult!.complete('Late private A result');
      await tester.pumpAndSettle();
      expect(
        find.text('Late private A result', skipOffstage: false),
        findsNothing,
      );
      expect(h.container.read(currentUserProvider)?.id, 'b');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'late A guest recovery cannot sign out B or clear B navigation after account replacement',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      h.auth.pendingLogout = Completer<void>();
      h.dialogResult = Completer<String>();
      await h.openRouter(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      backgroundApp(tester);
      resumeApp(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out here and browse as guest'));
      for (var frame = 0; frame < 30 && h.auth.logouts == 0; frame++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(h.auth.logouts, 1);
      h.container.read(authStateProvider.notifier).setUser(_user('b'));
      await tester.pumpAndSettle();
      expect(find.text('Private account b'), findsOneWidget);
      h.container.read(appRouterProvider).go('/public');
      await tester.pumpAndSettle();
      h.auth.pendingLogout!.complete();
      h.dialogResult!.complete('Late private A result');
      await tester.pumpAndSettle();
      expect(h.container.read(currentUserProvider)?.id, 'b');
      expect(h.container.read(guestModeProvider), isFalse);
      expect(find.text('Public destination'), findsOneWidget);
      expect(
        find.text('Late private A result', skipOffstage: false),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'navigation reset failure keeps shield and does not initiate guest sign-out',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      await h.openRouter(tester);
      h.failNavigation = true;
      await tester.tap(find.text('Sign out here and browse as guest'));
      await tester.pumpAndSettle();
      expect(
        find.text('Private navigation could not be cleared'),
        findsOneWidget,
      );
      expect(find.text('Private account a'), findsNothing);
      expect(h.auth.logouts, 0);
      h.failNavigation = false;
      await tester.tap(find.text('Retry clearing private navigation'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out here and browse as guest'));
      await tester.pumpAndSettle();
      expect(find.text('Public browsing'), findsOneWidget);
    },
  );

  testWidgets(
    'same-account validation preserves private dialog and navigation',
    (tester) async {
      final h = _Harness();
      await h.openRouter(tester);
      await tester.tap(find.text('Open private dialog'));
      await tester.pumpAndSettle();
      final validation = h.container
          .read(authStateProvider.notifier)
          .validateToken();
      await tester.pumpAndSettle();
      await validation;
      expect(find.text('Private dialog'), findsOneWidget);
      expect(h.resets, 0);
    },
  );

  testWidgets(
    'storage failure never reveals private routes and supports reload',
    (tester) async {
      final h = _Harness()..store.fail = true;
      await h.open(tester);
      expect(find.text('Private account a'), findsNothing);
      expect(find.text('Retry device support'), findsOneWidget);
      h.store.fail = false;
      await tester.tap(find.text('Retry device support'));
      await tester.pumpAndSettle();
      expect(find.text('Private account a'), findsOneWidget);
    },
  );

  testWidgets(
    'OS inactive is tolerated but background cancels and late success cannot unlock',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      h.os.pending = Completer<DeviceUnlockResult>();
      await h.open(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(h.os.cancellations, 0);
      backgroundApp(tester);
      await tester.pump();
      expect(h.os.cancellations, 1);
      h.os.pending!.complete(DeviceUnlockResult.unlocked);
      resumeApp(tester);
      await tester.pumpAndSettle();
      expect(find.text('Private account a'), findsNothing);
    },
  );

  testWidgets(
    'account switch discards late A unlock and applies B preference independently',
    (tester) async {
      final h = _Harness()
        ..store.values['a'] = DeviceUnlockPreference.everyReopen;
      h.os.pending = Completer<DeviceUnlockResult>();
      await h.open(tester);
      await tester.tap(find.text('Unlock with device credentials'));
      await tester.pump();
      h.container.read(authStateProvider.notifier).setUser(_user('b'));
      await tester.pumpAndSettle();
      expect(find.text('Private account b'), findsOneWidget);
      h.os.pending!.complete(DeviceUnlockResult.unlocked);
      await tester.pumpAndSettle();
      h.container.read(authStateProvider.notifier).setUser(_user('a'));
      await tester.pumpAndSettle();
      expect(find.text('Private account a'), findsNothing);
      expect(find.text('Unlock Lythaus'), findsOneWidget);
    },
  );
}

import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/guest_preferences_storage.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';
import 'package:lythaus/features/profile/presentation/presentation_preferences_section.dart';
import 'package:lythaus/state/providers/settings_providers.dart';

final session = StateProvider<User?>((ref) => member('owner-a'));
User member(String id) => User(
  id: id,
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class GuestStore implements GuestPreferencesStorage {
  PresentationPreferences value = const PresentationPreferences(
    horizontalSwipeEnabled: false,
  );
  int writes = 0;
  @override
  Future<PresentationPreferences> load() async => value;
  @override
  Future<void> save(PresentationPreferences preferences) async {
    writes++;
    value = preferences;
  }
}

class Adapter implements HttpClientAdapter {
  Adapter(this.respond);
  final Future<Map<String, dynamic>> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(await respond(options)),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> owner(String id, PresentationPreferences preferences) => {
  'user': {
    'id': id,
    'displayName': 'Saved identity',
    'moderationState': 'allowed',
    'publicVisibility': true,
    'presentationPreferences': preferences.toJson(),
  },
};

Future<void> until(bool Function() ready) async {
  for (var i = 0; i < 100 && !ready(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
  expect(ready(), isTrue);
}

ProviderContainer container(Dio dio, GuestStore guest) => ProviderContainer(
  overrides: [
    secureDioProvider.overrideWithValue(dio),
    currentUserProvider.overrideWith((ref) => ref.watch(session)),
    authSessionRevisionProvider.overrideWith(
      (ref) => AuthSessionRevision(ref.read(session.notifier)),
    ),
    jwtProvider.overrideWith((ref) async => 'token-${ref.watch(session)?.id}'),
    guestPreferencesStorageProvider.overrideWithValue(guest),
  ],
);

Widget preferencesApp(ProviderContainer scope) => UncontrolledProviderScope(
  container: scope,
  child: const MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(child: PresentationPreferencesSection()),
    ),
  ),
);

Finder preferenceSwitch(String title) =>
    find.widgetWithText(SwitchListTile, title);

void main() {
  for (final editLeft in [true, false]) {
    for (final serverChanged in [false, true]) {
      testWidgets(
        'resume preserves dirty ${editLeft ? 'handedness' : 'swipe'} with serverChanged=$serverChanged',
        (tester) async {
          var saved = const PresentationPreferences();
          final adapter = Adapter((request) async {
            if (request.method == 'PATCH') {
              final input =
                  (request.data as Map)['presentationPreferences'] as Map;
              saved = PresentationPreferences(
                leftHandedMode: input['leftHandedMode'] as bool,
                horizontalSwipeEnabled: input['horizontalSwipeEnabled'] as bool,
                version: saved.version + 1,
              );
            }
            return owner('owner-a', saved);
          });
          final scope = container(
            Dio(BaseOptions(baseUrl: 'https://local.invalid'))
              ..httpClientAdapter = adapter,
            GuestStore(),
          );
          addTearDown(scope.dispose);
          await tester.pumpWidget(preferencesApp(scope));
          await tester.pumpAndSettle();
          final left = preferenceSwitch('Left-handed mode (mirror nav)');
          final swipe = preferenceSwitch('Swipe between profile tabs');
          await tester.tap(editLeft ? left : swipe);
          await tester.pumpAndSettle();
          expect(scope.read(leftHandedModeProvider), isFalse);
          expect(scope.read(horizontalSwipeEnabledProvider), isTrue);
          final reads = adapter.requests.length;
          if (serverChanged) {
            saved = PresentationPreferences(
              leftHandedMode: !editLeft,
              horizontalSwipeEnabled: !editLeft,
              version: 2,
            );
          }
          tester.binding.handleAppLifecycleStateChanged(
            AppLifecycleState.inactive,
          );
          tester.binding.handleAppLifecycleStateChanged(
            AppLifecycleState.resumed,
          );
          await tester.pumpAndSettle();
          final visibleLeft = editLeft || saved.leftHandedMode;
          final visibleSwipe = editLeft && saved.horizontalSwipeEnabled;
          expect(tester.widget<SwitchListTile>(left).value, visibleLeft);
          expect(tester.widget<SwitchListTile>(swipe).value, visibleSwipe);
          expect(scope.read(leftHandedModeProvider), saved.leftHandedMode);
          expect(
            scope.read(horizontalSwipeEnabledProvider),
            saved.horizontalSwipeEnabled,
          );
          expect(adapter.requests.length, reads + 1);
          expect(
            adapter.requests.every((request) => request.method == 'GET'),
            isTrue,
          );
          expect(
            find.text(
              'Saved choices changed on another device. Your edits are preserved; review the choices before saving.',
            ),
            serverChanged ? findsOneWidget : findsNothing,
          );
          final save = find.widgetWithText(FilledButton, 'Save preferences');
          expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
          final expectedVersion = saved.version;
          await tester.ensureVisible(save);
          await tester.tap(save);
          await tester.pumpAndSettle();
          final patches = adapter.requests
              .where((request) => request.method == 'PATCH')
              .toList();
          expect(patches, hasLength(1));
          expect(patches.single.data, {
            'presentationPreferences': {
              'leftHandedMode': visibleLeft,
              'horizontalSwipeEnabled': visibleSwipe,
              'expectedVersion': expectedVersion,
            },
          });
          expect(scope.read(leftHandedModeProvider), visibleLeft);
          expect(scope.read(horizontalSwipeEnabledProvider), visibleSwipe);
          expect(
            scope.read(settingsProvider).preferencesVersion,
            expectedVersion + 1,
          );
          expect(find.text('Discard preference changes'), findsNothing);
          final edited = editLeft ? left : swipe;
          await tester.ensureVisible(edited);
          await tester.tap(edited);
          await tester.pumpAndSettle();
          expect(find.text('Discard preference changes'), findsOneWidget);
          final reload = find.text('Reload saved preferences');
          await tester.ensureVisible(reload);
          await tester.tap(reload);
          await tester.pumpAndSettle();
          expect(
            tester.widget<SwitchListTile>(left).value,
            saved.leftHandedMode,
          );
          expect(
            tester.widget<SwitchListTile>(swipe).value,
            saved.horizontalSwipeEnabled,
          );
          expect(tester.widget<FilledButton>(save).onPressed, isNull);
          expect(
            adapter.requests.where((request) => request.method == 'PATCH'),
            hasLength(1),
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets(
    'failed resume refresh keeps the dirty draft disabled until recovery',
    (tester) async {
      var failing = false;
      final adapter = Adapter((request) async {
        if (failing) {
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        }
        return owner('owner-a', const PresentationPreferences());
      });
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      addTearDown(scope.dispose);
      await tester.pumpWidget(preferencesApp(scope));
      await tester.pumpAndSettle();
      final left = preferenceSwitch('Left-handed mode (mirror nav)');
      await tester.tap(left);
      await tester.pumpAndSettle();
      failing = true;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(left).value, isTrue);
      expect(tester.widget<SwitchListTile>(left).onChanged, isNull);
      final save = find.widgetWithText(FilledButton, 'Save preferences');
      expect(tester.widget<FilledButton>(save).onPressed, isNull);
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(
        find.text('Unable to load saved preferences. Retry to continue.'),
        findsOneWidget,
      );
      failing = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(left).value, isTrue);
      expect(tester.widget<SwitchListTile>(left).onChanged, isNotNull);
      expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(
        adapter.requests.every((request) => request.method == 'GET'),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('resume preserves an in-flight save and its visible draft', (
    tester,
  ) async {
    var saved = const PresentationPreferences();
    final pending = Completer<Map<String, dynamic>>();
    final adapter = Adapter(
      (request) async =>
          request.method == 'PATCH' ? pending.future : owner('owner-a', saved),
    );
    final scope = container(
      Dio(BaseOptions(baseUrl: 'https://local.invalid'))
        ..httpClientAdapter = adapter,
      GuestStore(),
    );
    addTearDown(scope.dispose);
    await tester.pumpWidget(preferencesApp(scope));
    await tester.pumpAndSettle();
    final left = preferenceSwitch('Left-handed mode (mirror nav)');
    await tester.tap(left);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save preferences'));
    await tester.pump();
    await tester.pump();
    expect(scope.read(settingsProvider).preferencesSaving, isTrue);
    final requests = adapter.requests.length;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();
    expect(adapter.requests.length, requests);
    expect(tester.widget<SwitchListTile>(left).value, isTrue);
    expect(tester.widget<SwitchListTile>(left).onChanged, isNull);
    expect(scope.read(leftHandedModeProvider), isFalse);
    saved = const PresentationPreferences(leftHandedMode: true, version: 2);
    pending.complete(owner('owner-a', saved));
    await tester.pumpAndSettle();
    expect(scope.read(leftHandedModeProvider), isTrue);
    expect(scope.read(settingsProvider).preferencesSaving, isFalse);
    expect(
      adapter.requests.where((request) => request.method == 'PATCH'),
      hasLength(1),
    );
    expect(find.text('Discard preference changes'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'account switch clears a dirty editor and fences its late refresh',
    (tester) async {
      var refreshing = false;
      final pending = Completer<Map<String, dynamic>>();
      final adapter = Adapter((request) async {
        if (request.headers['Authorization'] == 'Bearer token-owner-b') {
          return owner('owner-b', const PresentationPreferences());
        }
        if (refreshing) return pending.future;
        return owner('owner-a', const PresentationPreferences());
      });
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      addTearDown(scope.dispose);
      await tester.pumpWidget(preferencesApp(scope));
      await tester.pumpAndSettle();
      final left = preferenceSwitch('Left-handed mode (mirror nav)');
      await tester.tap(left);
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(left).value, isTrue);
      refreshing = true;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      await tester.pump();
      expect(scope.read(settingsProvider).preferencesLoading, isTrue);
      scope.read(session.notifier).state = member('owner-b');
      await tester.pumpAndSettle();
      pending.complete(
        owner(
          'owner-a',
          const PresentationPreferences(leftHandedMode: true, version: 2),
        ),
      );
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesOwnerId, 'owner-b');
      expect(scope.read(settingsProvider).preferencesVersion, 1);
      expect(tester.widget<SwitchListTile>(left).value, isFalse);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save preferences'),
            )
            .onPressed,
        isNull,
      );
      expect(find.text('Discard preference changes'), findsNothing);
      expect(
        adapter.requests.every((request) => request.method == 'GET'),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'resuming refreshes account choices changed on another device without saving',
    (tester) async {
      var saved = const PresentationPreferences();
      final adapter = Adapter((request) async {
        return owner('owner-a', saved);
      });
      final guest = GuestStore();
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        guest,
      );
      addTearDown(scope.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: scope,
          child: const MaterialApp(
            home: Scaffold(body: PresentationPreferencesSection()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesAvailable, isTrue);
      final reads = adapter.requests.length;
      saved = const PresentationPreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
        version: 2,
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(scope.read(settingsProvider).preferencesLoading, isTrue);
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesMessage, isNull);
      expect(scope.read(settingsProvider).preferencesLoading, isFalse);
      expect(scope.read(leftHandedModeProvider), isTrue);
      expect(scope.read(horizontalSwipeEnabledProvider), isFalse);
      expect(scope.read(settingsProvider).preferencesVersion, 2);
      expect(adapter.requests.length, reads + 1);
      for (final request in adapter.requests) {
        expect(request.path, '/api/users/me');
        expect(request.method, 'GET');
        expect(request.headers['Authorization'], 'Bearer token-owner-a');
      }
      expect(guest.writes, 0);
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(
                SwitchListTile,
                'Left-handed mode (mirror nav)',
              ),
            )
            .value,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'account switching fences a late foreground refresh and disposal removes its listener',
    () async {
      final binding = TestWidgetsFlutterBinding.ensureInitialized();
      final pending = Completer<Map<String, dynamic>>();
      var refreshing = false;
      final adapter = Adapter((request) async {
        if (request.headers['Authorization'] == 'Bearer token-owner-b') {
          return owner('owner-b', const PresentationPreferences());
        }
        if (refreshing) return pending.future;
        return owner(
          'owner-a',
          const PresentationPreferences(leftHandedMode: true, version: 7),
        );
      });
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      scope.read(settingsProvider);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      refreshing = true;
      binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await until(() => adapter.requests.length == 2);
      scope.read(session.notifier).state = member('owner-b');
      expect(scope.read(leftHandedModeProvider), isFalse);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      pending.complete(
        owner(
          'owner-a',
          const PresentationPreferences(leftHandedMode: true, version: 8),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(scope.read(settingsProvider).preferencesOwnerId, 'owner-b');
      expect(scope.read(settingsProvider).preferencesVersion, 1);
      expect(scope.read(leftHandedModeProvider), isFalse);
      final reads = adapter.requests.length;
      scope.dispose();
      binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await Future<void>.delayed(Duration.zero);
      expect(adapter.requests.length, reads);
    },
  );

  for (final failure in [
    'missing schema',
    'network failure',
    'stale revision',
  ]) {
    testWidgets('foreground $failure disables saves until reload', (
      tester,
    ) async {
      var refreshing = false;
      var repaired = false;
      const saved = PresentationPreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
        version: 4,
      );
      final adapter = Adapter((request) async {
        if (repaired) {
          return owner('owner-a', const PresentationPreferences(version: 5));
        }
        if (!refreshing) return owner('owner-a', saved);
        if (failure == 'network failure') {
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        }
        final result = owner(
          'owner-a',
          const PresentationPreferences(version: 3),
        );
        if (failure == 'missing schema') {
          (result['user'] as Map).remove('presentationPreferences');
        }
        return result;
      });
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      addTearDown(scope.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: scope,
          child: const MaterialApp(
            home: Scaffold(body: PresentationPreferencesSection()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      refreshing = true;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesAvailable, isFalse);
      expect(scope.read(settingsProvider).preferencesVersion, 4);
      expect(scope.read(leftHandedModeProvider), isTrue);
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(
                SwitchListTile,
                'Left-handed mode (mirror nav)',
              ),
            )
            .onChanged,
        isNull,
      );
      expect(
        find.text(
          failure == 'missing schema'
              ? 'Account preferences are not available yet.'
              : 'Unable to load saved preferences. Retry to continue.',
        ),
        findsOneWidget,
      );
      repaired = true;
      await tester.tap(find.text('Reload saved preferences'));
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesAvailable, isTrue);
      expect(scope.read(settingsProvider).preferencesVersion, 5);
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(
        adapter.requests.every((request) => request.method == 'GET'),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    });
  }

  test(
    'real preference providers save/reopen and hydrate a second signed-in device',
    () async {
      var saved = const PresentationPreferences();
      final adapter = Adapter((request) async {
        expect(request.path, '/api/users/me');
        expect(request.headers['Authorization'], 'Bearer token-owner-a');
        if (request.method == 'PATCH') {
          final input = (request.data as Map)['presentationPreferences'] as Map;
          expect(input['expectedVersion'], saved.version);
          saved = PresentationPreferences(
            leftHandedMode: input['leftHandedMode'] as bool,
            horizontalSwipeEnabled: input['horizontalSwipeEnabled'] as bool,
            version: saved.version + 1,
          );
        }
        return owner('owner-a', saved);
      });
      final guest = GuestStore();
      final first = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        guest,
      );
      first.read(settingsProvider);
      await until(() => first.read(settingsProvider).preferencesAvailable);
      await first
          .read(settingsProvider.notifier)
          .savePreferences(leftHandedMode: true, horizontalSwipeEnabled: false);
      expect(first.read(leftHandedModeProvider), isTrue);
      expect(first.read(horizontalSwipeEnabledProvider), isFalse);
      expect(
        adapter.requests.where((request) => request.method == 'PATCH'),
        hasLength(1),
      );
      expect(
        adapter.requests
            .firstWhere((request) => request.method == 'PATCH')
            .headers['Idempotency-Key'],
        isNotEmpty,
      );
      first.dispose();
      final second = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        guest,
      );
      addTearDown(second.dispose);
      second.read(settingsProvider);
      await until(() => second.read(settingsProvider).preferencesAvailable);
      expect(second.read(leftHandedModeProvider), isTrue);
      expect(second.read(settingsProvider).preferencesVersion, 2);
      expect(guest.writes, 0);
      expect(
        adapter.requests.where((request) => request.method == 'PATCH'),
        hasLength(1),
      );
    },
  );

  test(
    'A to guest to B to A keeps account and guest storage separate without automatic migration',
    () async {
      var actor = 'owner-a';
      final adapter = Adapter(
        (request) async => owner(
          actor,
          PresentationPreferences(
            leftHandedMode: actor == 'owner-a',
            horizontalSwipeEnabled: true,
          ),
        ),
      );
      final guest = GuestStore();
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        guest,
      );
      addTearDown(scope.dispose);
      scope.read(settingsProvider);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      expect(scope.read(leftHandedModeProvider), isTrue);
      scope.read(session.notifier).state = null;
      expect(scope.read(leftHandedModeProvider), isFalse);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      expect(scope.read(horizontalSwipeEnabledProvider), isFalse);
      final guestReads = adapter.requests.length;
      final binding = TestWidgetsFlutterBinding.ensureInitialized();
      binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await Future<void>.delayed(Duration.zero);
      expect(adapter.requests.length, guestReads);
      await scope
          .read(settingsProvider.notifier)
          .savePreferences(
            leftHandedMode: false,
            horizontalSwipeEnabled: false,
          );
      expect(guest.writes, 1);
      actor = 'owner-b';
      scope.read(session.notifier).state = member(actor);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(scope.read(horizontalSwipeEnabledProvider), isTrue);
      actor = 'owner-a';
      scope.read(session.notifier).state = member(actor);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      expect(scope.read(leftHandedModeProvider), isTrue);
      expect(scope.read(horizontalSwipeEnabledProvider), isTrue);
      expect(
        adapter.requests.every((request) => request.method == 'GET'),
        isTrue,
      );
    },
  );

  test(
    'logout cancels an in-flight private save and rejects its late acknowledgement',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      final adapter = Adapter(
        (request) async => request.method == 'PATCH'
            ? pending.future
            : owner(
                'owner-a',
                const PresentationPreferences(leftHandedMode: true),
              ),
      );
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      addTearDown(scope.dispose);
      scope.read(settingsProvider);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      final save = scope
          .read(settingsProvider.notifier)
          .savePreferences(leftHandedMode: false, horizontalSwipeEnabled: true);
      await until(
        () => adapter.requests.any((request) => request.method == 'PATCH'),
      );
      scope.read(session.notifier).state = null;
      expect(scope.read(leftHandedModeProvider), isFalse);
      await until(() => scope.read(settingsProvider).preferencesAvailable);
      pending.complete(
        owner(
          'owner-a',
          const PresentationPreferences(leftHandedMode: true, version: 2),
        ),
      );
      await save;
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(scope.read(settingsProvider).preferencesOwnerId, isNull);
      expect(scope.read(settingsProvider).preferencesMessage, isNull);
    },
  );

  testWidgets(
    'unconfirmed save reopens with the same visible choices and retries its original payload',
    (tester) async {
      var saved = const PresentationPreferences();
      var attempts = 0;
      final adapter = Adapter((request) async {
        if (request.method == 'PATCH') {
          attempts++;
          if (attempts == 1) {
            throw DioException(
              requestOptions: request,
              type: DioExceptionType.connectionError,
            );
          }
          final input = (request.data as Map)['presentationPreferences'] as Map;
          saved = PresentationPreferences(
            leftHandedMode: input['leftHandedMode'] as bool,
            horizontalSwipeEnabled: input['horizontalSwipeEnabled'] as bool,
            version: saved.version + 1,
          );
        }
        return owner('owner-a', saved);
      });
      final scope = container(
        Dio(BaseOptions(baseUrl: 'https://local.invalid'))
          ..httpClientAdapter = adapter,
        GuestStore(),
      );
      addTearDown(scope.dispose);
      Widget app() => UncontrolledProviderScope(
        container: scope,
        child: const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: PresentationPreferencesSection(),
            ),
          ),
        ),
      );
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      final left = find.widgetWithText(
        SwitchListTile,
        'Left-handed mode (mirror nav)',
      );
      final swipe = find.widgetWithText(
        SwitchListTile,
        'Swipe between profile tabs',
      );
      await tester.tap(left);
      await tester.pumpAndSettle();
      await tester.tap(swipe);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save preferences'));
      await tester.pumpAndSettle();
      expect(scope.read(settingsProvider).preferencesRetryPending, isTrue);
      expect(scope.read(leftHandedModeProvider), isFalse);
      expect(scope.read(horizontalSwipeEnabledProvider), isTrue);
      final requests = adapter.requests.length;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(adapter.requests.length, requests);
      expect(scope.read(settingsProvider).preferencesRetryPending, isTrue);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(left).value, isTrue);
      expect(tester.widget<SwitchListTile>(swipe).value, isFalse);
      expect(tester.widget<SwitchListTile>(left).onChanged, isNull);
      await tester.tap(find.text('Retry save preferences'));
      await tester.pumpAndSettle();
      final patches = adapter.requests
          .where((request) => request.method == 'PATCH')
          .toList();
      expect(patches, hasLength(2));
      expect(patches[1].data, patches[0].data);
      expect(
        patches[1].headers['Idempotency-Key'],
        patches[0].headers['Idempotency-Key'],
      );
      expect(scope.read(leftHandedModeProvider), isTrue);
      expect(scope.read(horizontalSwipeEnabledProvider), isFalse);
      expect(scope.read(settingsProvider).preferencesVersion, 2);
      expect(tester.takeException(), isNull);
    },
  );

  for (final brightness in Brightness.values) {
    testWidgets(
      'explicit Save/discard/reopen works at 320px and large text in $brightness',
      (tester) async {
        var saved = const PresentationPreferences();
        var writes = 0;
        final scope = ProviderContainer(
          overrides: [
            currentUserProvider.overrideWithValue(member('owner-a')),
            settingsProvider.overrideWith(
              (ref) => SettingsController(
                ownerId: 'owner-a',
                load: () async => saved,
                save: (preferences, key) async {
                  writes++;
                  saved = PresentationPreferences(
                    leftHandedMode: preferences.leftHandedMode,
                    horizontalSwipeEnabled: preferences.horizontalSwipeEnabled,
                    version: saved.version + 1,
                  );
                  return saved;
                },
              ),
            ),
          ],
        );
        addTearDown(scope.dispose);
        tester.view.physicalSize = const Size(320, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        Widget app() => UncontrolledProviderScope(
          container: scope,
          child: MaterialApp(
            theme: ThemeData(brightness: brightness),
            home: const MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(2)),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: PresentationPreferencesSection(),
                ),
              ),
            ),
          ),
        );
        await tester.pumpWidget(app());
        await tester.pumpAndSettle();
        final semantics = tester.ensureSemantics();
        final left = find.widgetWithText(
          SwitchListTile,
          'Left-handed mode (mirror nav)',
        );
        try {
          expect(
            tester.getSemantics(left).getSemanticsData().label,
            contains('Left-handed mode (mirror nav)'),
          );
        } finally {
          semantics.dispose();
        }
        await tester.ensureVisible(left);
        await tester.tap(left);
        await tester.pumpAndSettle();
        expect(scope.read(leftHandedModeProvider), isFalse);
        expect(writes, 0);
        final discard = find.text('Discard preference changes');
        await tester.ensureVisible(discard);
        await tester.tap(discard);
        await tester.pumpAndSettle();
        expect(tester.widget<SwitchListTile>(left).value, isFalse);
        await tester.ensureVisible(left);
        await tester.tap(left);
        await tester.pumpAndSettle();
        final save = find.text('Save preferences');
        await tester.ensureVisible(save);
        await tester.tap(save);
        await tester.pumpAndSettle();
        expect(scope.read(leftHandedModeProvider), isTrue);
        expect(writes, 1);
        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(app());
        await tester.pumpAndSettle();
        expect(tester.widget<SwitchListTile>(left).value, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

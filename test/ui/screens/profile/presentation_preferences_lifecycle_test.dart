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

void main() {
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

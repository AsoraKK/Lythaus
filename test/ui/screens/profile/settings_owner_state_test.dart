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
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';

final _session = StateProvider<User?>((ref) => _user('owner-a'));
User _user(String id) => User(
  id: id,
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Map<String, dynamic> _owner(String id, String visibility) => {
  'user': {
    'id': id,
    'displayName': 'Saved private name',
    'moderationState': 'under_review',
    'publicVisibility': visibility != 'private',
    'trustPassportVisibility': visibility,
  },
};

ResponseBody _response(Map<String, dynamic> body, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  final cancellations = <Future<void>?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    if (options.method == 'PATCH') cancellations.add(cancelFuture);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

Future<ProviderContainer> _open(
  WidgetTester tester,
  _Adapter adapter, {
  Future<String?>? token,
  bool overrideOwner = false,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      authSessionRevisionProvider.overrideWith(
        (ref) => AuthSessionRevision(ref.read(_session.notifier)),
      ),
      currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      jwtProvider.overrideWith((ref) async {
        final id = ref.watch(currentUserProvider)?.id;
        return token ?? 'token-$id';
      }),
      secureDioProvider.overrideWithValue(dio),
      if (overrideOwner)
        ownerProfileProvider.overrideWith((ref) async {
          final id = ref.watch(currentUserProvider)!.id;
          return OwnerProfile.fromJson(_owner(id, 'public_minimal'));
        }),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: SettingsScreen()),
    ),
  );
  await tester.pump();
  await tester.pump();
  return container;
}

ChoiceChip _chip(WidgetTester tester, String label) =>
    tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, label));

Future<void> _choosePrivate(WidgetTester tester, {bool settle = true}) async {
  final option = find.widgetWithText(ChoiceChip, 'Private');
  await tester.ensureVisible(option);
  await tester.tap(option);
  await tester.pump();
  await tester.pump();
  if (settle) await tester.pumpAndSettle();
}

void main() {
  testWidgets('private under-review owner reads saved visibility privately', (
    tester,
  ) async {
    final adapter = _Adapter((request) async {
      if (request.path == '/api/users/me') {
        return _response(_owner('owner-a', 'private'));
      }
      return _response({'error': 'not_found'}, 404);
    });
    await _open(tester, adapter);
    await tester.pumpAndSettle();
    expect(_chip(tester, 'Private').selected, isTrue);
    expect(_chip(tester, 'Private').onSelected, isNotNull);
    expect(adapter.requests.map((request) => request.path), ['/api/users/me']);
  });

  testWidgets('unavailable owner data never displays a local privacy guess', (
    tester,
  ) async {
    var failing = true;
    final adapter = _Adapter(
      (request) async => failing
          ? _response({'error': 'unavailable'}, 503)
          : _response(_owner('owner-a', 'private')),
    );
    final container = await _open(tester, adapter);
    container
        .read(settingsProvider.notifier)
        .setTrustPassportVisibility('public_expanded');
    await tester.pumpAndSettle();
    for (final label in ['Public', 'Minimal', 'Private']) {
      expect(_chip(tester, label).selected, isFalse);
      expect(_chip(tester, label).onSelected, isNull);
    }
    expect(find.text('Unable to load your saved visibility.'), findsOneWidget);
    failing = false;
    await tester.tap(find.text('Retry visibility'));
    await tester.pumpAndSettle();
    expect(_chip(tester, 'Private').selected, isTrue);
  });

  testWidgets('failed save preserves the previous authoritative visibility', (
    tester,
  ) async {
    final adapter = _Adapter(
      (request) async => request.method == 'PATCH'
          ? _response({'error': 'rate_limited'}, 429)
          : _response(_owner('owner-a', 'public_minimal')),
    );
    await _open(tester, adapter);
    await tester.pumpAndSettle();
    await _choosePrivate(tester);
    await tester.pumpAndSettle();
    expect(_chip(tester, 'Minimal').selected, isTrue);
    expect(_chip(tester, 'Private').selected, isFalse);
    expect(
      find.text('Too many profile updates. Please wait before trying again.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'saved visibility refreshes owner, public and passport projections',
    (tester) async {
      var visibility = 'public_minimal';
      final adapter = _Adapter((request) async {
        if (request.method == 'PATCH') visibility = 'private';
        if (request.path.endsWith('/trust-passport')) {
          return _response({
            'userId': 'owner-a',
            'counts': <String, dynamic>{},
          });
        }
        return _response(_owner('owner-a', visibility));
      });
      final container = await _open(tester, adapter);
      final public = container.listen(publicUserProvider('owner-a'), (_, _) {});
      final passport = container.listen(
        trustPassportProvider('owner-a'),
        (_, _) {},
      );
      addTearDown(public.close);
      addTearDown(passport.close);
      await tester.pumpAndSettle();
      await _choosePrivate(tester);
      await tester.pumpAndSettle();
      expect(_chip(tester, 'Private').selected, isTrue);
      for (final path in [
        '/api/users/me',
        '/api/users/owner-a',
        '/api/users/owner-a/trust-passport',
      ]) {
        expect(
          adapter.requests.where(
            (request) => request.method == 'GET' && request.path == path,
          ),
          hasLength(2),
        );
      }
      expect(find.text('Profile visibility saved.'), findsOneWidget);
    },
  );

  testWidgets('account switch while awaiting token prevents an old save', (
    tester,
  ) async {
    final token = Completer<String?>();
    final adapter = _Adapter(
      (request) async => _response(_owner('owner-a', 'private')),
    );
    final container = await _open(
      tester,
      adapter,
      token: token.future,
      overrideOwner: true,
    );
    await _choosePrivate(tester, settle: false);
    expect(_chip(tester, 'Private').onSelected, isNull);
    container.read(_session.notifier).state = _user('owner-b');
    await tester.pump();
    token.complete('token-owner-a');
    await tester.pumpAndSettle();
    expect(
      adapter.requests.where((request) => request.method == 'PATCH'),
      isEmpty,
    );
    expect(find.text('Profile visibility saved.'), findsNothing);
    expect(_chip(tester, 'Minimal').selected, isTrue);
  });

  testWidgets(
    'account switch cancels a save and rejects a late acknowledgement',
    (tester) async {
      final pending = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.method == 'PATCH') return pending.future;
        final id = request.headers['Authorization'] == 'Bearer token-owner-b'
            ? 'owner-b'
            : 'owner-a';
        return _response(_owner(id, 'public_minimal'));
      });
      final container = await _open(tester, adapter);
      await tester.pumpAndSettle();
      await _choosePrivate(tester);
      bool cancelled = false;
      adapter.cancellations.single?.then((_) => cancelled = true);
      container.read(_session.notifier).state = _user('owner-b');
      await tester.pumpAndSettle();
      expect(cancelled, isTrue);
      pending.complete(_response(_owner('owner-a', 'private')));
      await tester.pumpAndSettle();
      expect(_chip(tester, 'Minimal').selected, isTrue);
      expect(_chip(tester, 'Private').onSelected, isNotNull);
      expect(find.text('Profile visibility saved.'), findsNothing);
      expect(
        container.read(settingsProvider).trustPassportVisibility,
        isNot('private'),
      );
    },
  );

  testWidgets('leaving Settings cancels its outstanding visibility save', (
    tester,
  ) async {
    final pending = Completer<ResponseBody>();
    final adapter = _Adapter(
      (request) async => request.method == 'PATCH'
          ? pending.future
          : _response(_owner('owner-a', 'public_minimal')),
    );
    await _open(tester, adapter);
    await tester.pumpAndSettle();
    await _choosePrivate(tester);
    bool cancelled = false;
    adapter.cancellations.single?.then((_) => cancelled = true);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(cancelled, isTrue);
    pending.complete(_response(_owner('owner-a', 'private')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('mismatched acknowledgement cannot report a successful save', (
    tester,
  ) async {
    final adapter = _Adapter(
      (request) async => _response(
        _owner(
          request.method == 'PATCH' ? 'owner-b' : 'owner-a',
          'public_minimal',
        ),
      ),
    );
    await _open(tester, adapter);
    await tester.pumpAndSettle();
    await _choosePrivate(tester);
    await tester.pumpAndSettle();
    expect(find.text('Profile visibility saved.'), findsNothing);
    expect(find.text('Unable to update trust visibility.'), findsOneWidget);
    expect(_chip(tester, 'Minimal').selected, isTrue);
  });
}

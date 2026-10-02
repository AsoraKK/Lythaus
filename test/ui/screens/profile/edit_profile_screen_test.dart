import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/edit_profile_screen.dart';

final _user = User(
  id: 'owner-1',
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
final _session = StateProvider<User?>((ref) => _user);
const _empty = OwnerProfile(
  user: PublicUser(id: 'owner-1', displayName: '', tier: 'free'),
  moderationState: 'allowed',
  publicVisibility: true,
);

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _saved(RequestOptions options) => ResponseBody.fromString(
  jsonEncode({
    'user': {
      'id': 'owner-1',
      'displayName': (options.data as Map)['displayName'] ?? '',
      'bio': (options.data as Map)['bio'] ?? '',
      'moderationState': 'under_review',
      'publicVisibility': true,
    },
  }),
  200,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
  },
);

Future<ProviderContainer> _open(
  WidgetTester tester,
  _Adapter adapter, {
  OwnerProfile profile = _empty,
  Future<String?>? token,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      jwtProvider.overrideWith(
        (ref) => token ?? Future.value('synthetic-token'),
      ),
      secureDioProvider.overrideWithValue(dio),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => EditProfileScreen(profile: profile),
                ),
              ),
              child: const Text('Open editor'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open editor'));
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets(
    'bio-only and name-only changes save explicitly without omitted fields',
    (tester) async {
      for (final field in ['bio', 'displayName']) {
        final adapter = _Adapter((options) async => _saved(options));
        await _open(tester, adapter);
        final value = field == 'bio' ? 'A partial biography' : 'Zoë O’Connor';
        await tester.enterText(
          find.byType(TextFormField).at(field == 'bio' ? 1 : 0),
          value,
        );
        await tester.pump();
        await tester.pump();
        expect(adapter.requests, isEmpty);
        await tester.tap(find.text('Save profile'));
        await tester.pumpAndSettle();
        final request = adapter.requests.single;
        expect(request.path, '/api/users/me');
        expect(request.method, 'PATCH');
        expect(request.data, {field: value});
        expect(request.headers['Idempotency-Key'], isNotEmpty);
        expect(find.textContaining('not public yet'), findsOneWidget);
        expect(find.text('Open editor'), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
      }
    },
  );
  testWidgets(
    'bad names are rejected locally and valid international names pass',
    (tester) async {
      final adapter = _Adapter((options) async => _saved(options));
      await _open(tester, adapter);
      await tester.enterText(find.byType(TextFormField).first, 'ＦＵＣＫ');
      await tester.pump();
      await tester.tap(find.text('Save profile'));
      await tester.pumpAndSettle();
      expect(
        find.text('Please choose a different display name'),
        findsOneWidget,
      );
      expect(adapter.requests, isEmpty);
      await tester.enterText(find.byType(TextFormField).first, '李小龍');
      await tester.pump();
      await tester.tap(find.text('Save profile'));
      await tester.pumpAndSettle();
      expect(adapter.requests.single.data, {'displayName': '李小龍'});
    },
  );
  testWidgets('failed saves retain edits and retry the same idempotency key', (
    tester,
  ) async {
    late _Adapter adapter;
    adapter = _Adapter(
      (options) async => adapter.requests.length == 1
          ? ResponseBody.fromString(
              '{"error":"unavailable"}',
              503,
              headers: {
                Headers.contentTypeHeader: ['application/json'],
              },
            )
          : _saved(options),
    );
    await _open(tester, adapter);
    await tester.enterText(find.byType(TextFormField).last, 'Keep this draft');
    await tester.pump();
    await tester.tap(find.text('Save profile'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your edits are still here'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(find.byType(TextFormField).last)
          .controller!
          .text,
      'Keep this draft',
    );
    await tester.tap(find.text('Save profile'));
    await tester.pumpAndSettle();
    expect(adapter.requests.length, 2);
    expect(
      adapter.requests[0].headers['Idempotency-Key'],
      adapter.requests[1].headers['Idempotency-Key'],
    );
  });
  testWidgets(
    'back keeps or explicitly discards unsaved edits without a request',
    (tester) async {
      final adapter = _Adapter((options) async => _saved(options));
      await _open(tester, adapter);
      await tester.enterText(find.byType(TextFormField).last, 'Unsaved');
      await tester.pump();
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Discard unsaved changes?'), findsOneWidget);
      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard changes'));
      await tester.pumpAndSettle();
      expect(find.text('Open editor'), findsOneWidget);
      expect(adapter.requests, isEmpty);
    },
  );
  testWidgets(
    'a missing token is a visible failure and duplicate saves are blocked',
    (tester) async {
      final token = Completer<String?>();
      final adapter = _Adapter((options) async => _saved(options));
      await _open(tester, adapter, token: token.future);
      await tester.enterText(find.byType(TextFormField).last, 'Unsaved');
      await tester.pump();
      await tester.tap(find.text('Save profile'));
      await tester.pump();
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      token.complete(null);
      await tester.pumpAndSettle();
      expect(
        find.text('Your session expired. Sign in again to save.'),
        findsOneWidget,
      );
      expect(adapter.requests, isEmpty);
    },
  );
  testWidgets(
    'sign-out during token retrieval clears fields and prevents stale save',
    (tester) async {
      final token = Completer<String?>();
      final adapter = _Adapter((options) async => _saved(options));
      final container = await _open(tester, adapter, token: token.future);
      await tester.enterText(find.byType(TextFormField).last, 'Private draft');
      await tester.pump();
      await tester.tap(find.text('Save profile'));
      await tester.pump();
      container.read(_session.notifier).state = null;
      await tester.pump();
      token.complete('old-account-token');
      await tester.pumpAndSettle();
      expect(adapter.requests, isEmpty);
      expect(find.text('Private draft'), findsNothing);
      expect(find.text('Sign in to edit your profile.'), findsOneWidget);
    },
  );
}

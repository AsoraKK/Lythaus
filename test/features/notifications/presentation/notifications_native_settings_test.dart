import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';

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
const _preferences = {
  'emailEnabled': true,
  'pushEnabled': false,
  'repliesEnabled': true,
  'moderationEnabled': true,
  'rewardsEnabled': false,
};

class _Adapter implements HttpClientAdapter {
  _Adapter({this.save});
  final Future<Map<String, dynamic>> Function(RequestOptions)? save;
  final requests = <RequestOptions>[];
  Map<String, dynamic> preferences = {..._preferences};
  bool revoked = false;
  @override
  Future<ResponseBody> fetch(
    RequestOptions request,
    Stream<List<int>>? stream,
    Future<void>? cancellation,
  ) async {
    requests.add(request);
    Object body;
    if (request.path.endsWith('/revoke')) {
      revoked = true;
      body = {'id': 'device-a', 'revoked': true};
    } else if (request.path.endsWith('/devices')) {
      body = {
        'items': [
          if (!revoked)
            {
              'id': 'device-a',
              'platform': 'web',
              'active': true,
              'created_at': '2026-10-01T12:00:00Z',
              'revoked_at': null,
            },
        ],
      };
    } else {
      if (request.method == 'PUT') {
        preferences =
            await (save?.call(request) ??
                Future.value(Map<String, dynamic>.from(request.data as Map)));
      }
      body = request.headers['Authorization'] == 'Bearer token-owner-b'
          ? {..._preferences, 'emailEnabled': false}
          : preferences;
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<ProviderContainer> _open(
  WidgetTester tester,
  _Adapter adapter, {
  bool guest = false,
}) async {
  await tester.binding.setSurfaceSize(const Size(390, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid/api'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      guestModeProvider.overrideWith((ref) => guest),
      jwtProvider.overrideWith(
        (ref) async => 'token-${ref.watch(currentUserProvider)?.id}',
      ),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: NotificationsSettingsScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets(
    'native toggles and redacted devices save and revoke with acknowledged state',
    (tester) async {
      final adapter = _Adapter();
      await _open(tester, adapter);
      expect(find.byType(SwitchListTile), findsNWidgets(5));
      expect(find.byType(FilterChip), findsNothing);
      expect(find.text('Quiet hours are not available yet.'), findsOneWidget);
      expect(find.text('Web browser'), findsOneWidget);
      expect(find.textContaining('Last seen:'), findsNothing);
      await tester.tap(find.text('Push notifications'));
      await tester.pumpAndSettle();
      final save = adapter.requests.singleWhere(
        (request) => request.method == 'PUT',
      );
      expect(save.headers['Authorization'], 'Bearer token-owner-a');
      expect(save.data, {..._preferences, 'pushEnabled': true});
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(SwitchListTile, 'Push notifications'),
            )
            .value,
        isTrue,
      );
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(find.text('No devices registered'), findsOneWidget);
      expect(
        adapter.requests.where(
          (request) => request.path.endsWith('/device-a/revoke'),
        ),
        hasLength(1),
      );
    },
  );

  testWidgets('guest settings offers account entry without private requests', (
    tester,
  ) async {
    final adapter = _Adapter();
    await _open(tester, adapter, guest: true);
    expect(find.text('Sign in to manage notifications.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    expect(adapter.requests, isEmpty);
  });

  testWidgets(
    'account change rejects an old save toast and clears pending controls',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      final adapter = _Adapter(save: (_) => pending.future);
      final container = await _open(tester, adapter);
      await tester.tap(find.text('Push notifications'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      container.read(_session.notifier).state = _user('owner-b');
      await tester.pumpAndSettle();
      pending.complete({..._preferences, 'pushEnabled': true});
      await tester.pumpAndSettle();
      expect(find.text('Preferences updated'), findsNothing);
      expect(find.text('Unable to save preferences. Try again.'), findsNothing);
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(SwitchListTile, 'Email notifications'),
            )
            .value,
        isFalse,
      );
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(SwitchListTile, 'Push notifications'),
            )
            .value,
        isFalse,
      );
      expect(find.byType(LinearProgressIndicator), findsNothing);
    },
  );
}

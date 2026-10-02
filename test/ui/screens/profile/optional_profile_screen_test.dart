import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/optional_profile_screen.dart';

final _user = User(
  id: 'owner',
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
const _empty = OwnerProfile(
  user: PublicUser(id: 'owner', displayName: '', tier: 'free'),
  moderationState: 'allowed',
  publicVisibility: true,
);

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({
        'user': {
          'id': 'owner',
          'displayName': '',
          'bio': (options.data as Map)['bio'],
          'moderationState': 'under_review',
          'publicVisibility': true,
        },
      }),
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
  Future<OwnerProfile> Function() fetch, {
  bool requested = true,
  _Adapter? adapter,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
    ..httpClientAdapter = adapter ?? _Adapter();
  final container = ProviderContainer(
    overrides: [
      currentUserProvider.overrideWithValue(_user),
      ownerProfileProvider.overrideWith((ref) => fetch()),
      jwtProvider.overrideWith((ref) async => 'synthetic-token'),
      secureDioProvider.overrideWithValue(dio),
    ],
  );
  addTearDown(container.dispose);
  container.read(profileSetupRequestedProvider.notifier).state = requested;
  final router = GoRouter(
    initialLocation: '/profile/setup',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => const Scaffold(body: Text('Exploring')),
      ),
      GoRoute(
        path: '/profile/setup',
        builder: (_, _) => const OptionalProfileScreen(),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pump();
  return container;
}

void main() {
  testWidgets(
    'skip while the owner profile is loading enters the app without a save',
    (tester) async {
      final pending = Completer<OwnerProfile>();
      final adapter = _Adapter();
      final container = await _open(
        tester,
        () => pending.future,
        adapter: adapter,
      );
      await tester.tap(find.text('Skip and explore'));
      await tester.pumpAndSettle();
      expect(find.text('Exploring'), findsOneWidget);
      expect(container.read(profileSetupRequestedProvider), isFalse);
      expect(adapter.requests, isEmpty);
      pending.complete(_empty);
    },
  );
  testWidgets('a failed owner fetch supports retry and keeps skip available', (
    tester,
  ) async {
    var attempts = 0;
    await _open(tester, () async {
      if (++attempts == 1) throw StateError('offline');
      return _empty;
    });
    await tester.pumpAndSettle();
    expect(find.text('Unable to load your saved profile.'), findsOneWidget);
    expect(find.text('Skip and explore'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(attempts, 2);
    expect(find.text('Save profile'), findsOneWidget);
  });
  testWidgets(
    'save of a valid partial bio clears the offer and opens Discover',
    (tester) async {
      final adapter = _Adapter();
      final container = await _open(
        tester,
        () async => _empty,
        adapter: adapter,
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextFormField).last,
        'Partial profile',
      );
      await tester.pump();
      expect(adapter.requests, isEmpty);
      await tester.tap(find.text('Save profile'));
      await tester.pumpAndSettle();
      expect(find.text('Exploring'), findsOneWidget);
      expect(container.read(profileSetupRequestedProvider), isFalse);
      expect(adapter.requests.single.data, {'bio': 'Partial profile'});
    },
  );
  testWidgets('skip from a dirty form requires explicit discard', (
    tester,
  ) async {
    final adapter = _Adapter();
    await _open(tester, () async => _empty, adapter: adapter);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).last, 'Unsaved');
    await tester.pump();
    await tester.tap(find.text('Skip and explore'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved'), findsOneWidget);
    await tester.tap(find.text('Skip and explore'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard changes'));
    await tester.pumpAndSettle();
    expect(find.text('Exploring'), findsOneWidget);
    expect(adapter.requests, isEmpty);
  });
  testWidgets(
    'existing partial details bypass an automatic offer but remain editable through the route',
    (tester) async {
      const partial = OwnerProfile(
        user: PublicUser(
          id: 'owner',
          displayName: '',
          bio: 'Already saved',
          tier: 'free',
        ),
        moderationState: 'under_review',
        publicVisibility: true,
      );
      await _open(tester, () async => partial);
      await tester.pumpAndSettle();
      expect(find.text('Exploring'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await _open(tester, () async => partial, requested: false);
      await tester.pumpAndSettle();
      expect(find.text('Already saved'), findsOneWidget);
      expect(find.textContaining('not public yet'), findsOneWidget);
    },
  );
}

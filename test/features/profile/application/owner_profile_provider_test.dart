import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';

final _session = StateProvider<User?>((ref) => _user('u1'));
User _user(String id) => User(
  id: id,
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Map<String, dynamic> _body(String id, String state) => {
  'user': {
    'id': id,
    'displayName': 'Saved private name',
    'bio': 'Pending private bio',
    'subscriptionTier': 'premium',
    'moderationState': state,
    'publicVisibility': false,
  },
};

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<Map<String, dynamic>> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  final entered = Completer<void>();
  Future<void>? cancellation;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (!entered.isCompleted) entered.complete();
    cancellation = cancelFuture;
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

ProviderContainer _container(
  _Adapter adapter, {
  String? token = 'synthetic-token',
}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      jwtProvider.overrideWith((ref) async => token),
    ],
  );
  container.listen(ownerProfileProvider, (_, _) {});
  return container;
}

void main() {
  for (final state in ['under_review', 'blocked', 'allowed']) {
    test(
      'owner reads saved $state data only through the private endpoint',
      () async {
        final adapter = _Adapter((options) async => _body('u1', state));
        final container = _container(adapter);
        addTearDown(container.dispose);
        final profile = await container.read(ownerProfileProvider.future);
        expect(profile.moderationState, state);
        expect(profile.user.bio, 'Pending private bio');
        expect(profile.user.tier, 'premium');
        expect(adapter.requests.single.path, '/api/users/me');
        expect(
          adapter.requests.single.headers['Authorization'],
          'Bearer synthetic-token',
        );
      },
    );
  }
  test('guest and expired sessions cannot fetch owner data', () async {
    final adapter = _Adapter((options) async => _body('u1', 'under_review'));
    final container = _container(adapter, token: null);
    addTearDown(container.dispose);
    await expectLater(
      container.read(ownerProfileProvider.future),
      throwsStateError,
    );
    container.read(_session.notifier).state = null;
    await container.pump();
    await expectLater(
      container.read(ownerProfileProvider.future),
      throwsStateError,
    );
    expect(adapter.requests, isEmpty);
  });
  test(
    'mismatched owner responses and missing review status fail closed',
    () async {
      for (final body in [
        _body('u2', 'under_review'),
        {
          'user': {'id': 'u1', 'displayName': 'Missing status'},
        },
        <String, dynamic>{},
      ]) {
        final adapter = _Adapter((options) async => body);
        final container = _container(adapter);
        await expectLater(
          container.read(ownerProfileProvider.future),
          throwsFormatException,
        );
        container.dispose();
      }
    },
  );
  test(
    'sign-out cancels an in-flight private fetch and drops its data',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      final adapter = _Adapter((options) => pending.future);
      final container = _container(adapter);
      addTearDown(container.dispose);
      final subscription = container.listen(ownerProfileProvider, (_, _) {});
      addTearDown(subscription.close);
      await adapter.entered.future;
      bool cancelled = false;
      adapter.cancellation!.then((_) => cancelled = true);
      container.read(_session.notifier).state = null;
      await container.pump();
      await expectLater(
        container.read(ownerProfileProvider.future),
        throwsStateError,
      );
      await adapter.cancellation!.timeout(const Duration(seconds: 1));
      expect(cancelled, isTrue);
      pending.complete(_body('u1', 'under_review'));
      await container.pump();
      expect(container.read(ownerProfileProvider).valueOrNull, isNull);
    },
  );
  test(
    'moderation messages distinguish private, pending, blocked and unavailable',
    () {
      final pending = OwnerProfile.fromJson(_body('u1', 'under_review'));
      expect(pending.statusMessage, contains('not public yet'));
      expect(
        OwnerProfile.fromJson(_body('u1', 'blocked')).statusMessage,
        contains('not approved'),
      );
      expect(
        OwnerProfile.fromJson(_body('u1', 'allowed')).statusMessage,
        contains('private'),
      );
      expect(
        OwnerProfile.fromJson(_body('u1', 'unknown')).statusMessage,
        contains('unavailable'),
      );
    },
  );
}

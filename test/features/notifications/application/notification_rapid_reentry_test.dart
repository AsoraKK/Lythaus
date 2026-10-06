import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';

User user() => User(
  id: 'synthetic-a',
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
final session = StateProvider<User?>((ref) => user());

class Adapter implements HttpClientAdapter {
  final pending = Completer<void>();
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path.endsWith('/dismiss')) {
      await pending.future;
      return ResponseBody.fromString(
        '{}',
        200,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode({
        'items': [
          {
            'id': 'private-a',
            'notificationType': 'privacy_complete',
            'title': 'Private update',
            'readAt': null,
            'createdAt': '2026-10-01T12:00:00Z',
          },
        ],
        'totalUnread': 1,
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

void main() {
  test(
    'rapid same-account reentry must replace controller and reject old dismiss',
    () async {
      final adapter = Adapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid/api'))
        ..httpClientAdapter = adapter;
      final container = ProviderContainer(
        overrides: [
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(ref.read(session.notifier)),
          ),
          secureDioProvider.overrideWithValue(dio),
          currentUserProvider.overrideWith((ref) => ref.watch(session)),
          jwtProvider.overrideWith(
            (ref) async => ref.watch(currentUserProvider) == null
                ? null
                : 'synthetic-token',
          ),
        ],
      );
      addTearDown(container.dispose);
      final subscription = container.listen(
        notificationsControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final old = container.read(notificationsControllerProvider.notifier);
      await old.loadNotifications();
      final dismissing = old.dismiss('private-a');
      for (var i = 0; i < 8; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      container.read(session.notifier).state = null;
      container.read(session.notifier).state = user();
      await container.pump();
      final current = container.read(notificationsControllerProvider.notifier);
      await current.loadNotifications();
      adapter.pending.complete();
      await dismissing;
      expect(current, isNot(same(old)));
      expect(
        container.read(notificationsControllerProvider).notifications,
        hasLength(1),
      );
    },
  );
}

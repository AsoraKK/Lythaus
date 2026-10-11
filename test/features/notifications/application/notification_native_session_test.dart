import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';

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

const _nativePreferences = {
  'emailEnabled': true,
  'pushEnabled': false,
  'repliesEnabled': true,
  'moderationEnabled': true,
  'rewardsEnabled': false,
};

Map<String, dynamic> _page(String actor) => {
  'items': [
    {
      'id': 'private-$actor',
      'notificationType': 'privacy_complete',
      'entityId': 'request-$actor',
      'title': 'Update for $actor',
      'readAt': null,
      'createdAt': '2026-10-01T12:00:00Z',
    },
  ],
  'nextCursor': null,
  'totalUnread': 1,
};

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<Map<String, dynamic>> Function(RequestOptions) respond;
  int status = 200;
  final requests = <RequestOptions>[];
  final cancellations = <Future<void>?>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    cancellations.add(cancelFuture);
    return ResponseBody.fromString(
      jsonEncode(await respond(options)),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ProviderContainer _container(_Adapter adapter, {Future<String?>? token}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid/api'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      authSessionRevisionProvider.overrideWith(
        (ref) => AuthSessionRevision(ref.read(_session.notifier)),
      ),
      currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      jwtProvider.overrideWith((ref) async {
        final id = ref.watch(currentUserProvider)?.id;
        return token ?? (id == null ? null : 'token-$id');
      }),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

Future<void> _drain() async {
  for (var i = 0; i < 8; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

Future<ProviderContainer> _realAuthContainer(_Adapter adapter) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({
    'jwt': 'old-access',
    'refreshToken': 'old-refresh',
  });
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/auth/userinfo')) {
      expect(request.headers['Authorization'], 'Bearer old-access');
      return http.Response(jsonEncode(_user('owner-a').toJson()), 200);
    }
    expect(request.url.path, '/api/auth/refresh');
    expect(request.method, 'POST');
    expect(jsonDecode(request.body), {'refreshToken': 'old-refresh'});
    return http.Response(
      jsonEncode({'accessToken': 'new-access', 'refreshToken': 'new-refresh'}),
      200,
    );
  });
  addTearDown(client.close);
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid/api'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      enhancedAuthServiceProvider.overrideWithValue(
        AuthService(
          httpClient: client,
          authUrl: 'https://local.invalid/api',
          useWebSession: false,
        ),
      ),
    ],
  );
  addTearDown(container.dispose);
  container.read(authStateProvider);
  await _drain();
  expect(container.read(currentUserProvider)?.id, 'owner-a');
  return container;
}

void main() {
  test(
    'real same-owner token refresh recovers auth-required notifications and fences older reads',
    () async {
      final olderPage = Completer<Map<String, dynamic>>();
      var loads = 0;
      late final _Adapter adapter;
      adapter = _Adapter((request) async {
        if (request.method == 'POST') {
          adapter.status = 401;
          return {
            'error': {'code': 'authentication_required'},
          };
        }
        if (loads++ == 1) return olderPage.future;
        return _page(loads == 1 ? 'owner-a' : 'fresh-owner-a');
      });
      final container = await _realAuthContainer(adapter);
      final subscription = container.listen(
        notificationsControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final old = container.read(notificationsControllerProvider.notifier);
      await old.loadNotifications();
      final stale = old.loadNotifications();
      await _drain();
      expect(await old.markAsRead('private-owner-a'), isFalse);
      expect(old.state.authRequired, isTrue);
      final revision = container.read(authSessionRevisionProvider);
      final version = container.read(tokenVersionProvider);
      final owner = container.read(currentUserProvider);
      await container.read(authStateProvider.notifier).refreshToken();
      expect(
        container.read(authStateProvider).hasError,
        isFalse,
        reason:
            '${container.read(authStateProvider).error} ${container.read(authStateProvider).stackTrace}',
      );
      expect(container.read(currentUserProvider), same(owner));
      expect(container.read(authSessionRevisionProvider), revision);
      expect(container.read(tokenVersionProvider), version + 1);
      adapter.status = 200;
      await container.pump();
      final current = container.read(notificationsControllerProvider.notifier);
      expect(
        container.read(notificationApiServiceProvider).isCurrentSession,
        isTrue,
      );
      await current.loadNotifications();
      expect(current.state.authRequired, isFalse);
      expect(current.state.notifications.single.id, 'private-fresh-owner-a');
      expect(
        adapter.requests.last.headers['Authorization'],
        'Bearer new-access',
      );
      olderPage.complete(_page('stale-owner-a'));
      await stale;
      expect(current.state.notifications.single.id, 'private-fresh-owner-a');
    },
  );

  for (final dismissing in [false, true]) {
    test(
      'real same-owner token refresh synchronously fences pending ${dismissing ? 'dismiss' : 'read'}',
      () async {
        final receipt = Completer<Map<String, dynamic>>();
        final adapter = _Adapter((request) async {
          if (request.method == 'POST') return receipt.future;
          return _page('owner-a');
        });
        final container = await _realAuthContainer(adapter);
        final subscription = container.listen(
          notificationsControllerProvider,
          (_, _) {},
        );
        addTearDown(subscription.close);
        final old = container.read(notificationsControllerProvider.notifier);
        final oldService = container.read(notificationApiServiceProvider);
        await old.loadNotifications();
        final action = dismissing
            ? old.dismiss('private-owner-a')
            : old.markAsRead('private-owner-a');
        await _drain();
        expect(
          adapter.requests.where((request) => request.method == 'POST'),
          hasLength(1),
        );
        await container.read(authStateProvider.notifier).refreshToken();
        expect(oldService.isCurrentSession, isFalse);
        expect(await old.markAsRead('must-not-send'), isFalse);
        await container.pump();
        final current = container.read(
          notificationsControllerProvider.notifier,
        );
        expect(current, isNot(same(old)));
        expect(
          container.read(notificationApiServiceProvider).isCurrentSession,
          isTrue,
        );
        await current.loadNotifications();
        receipt.complete({
          'id': 'private-owner-a',
          'action': dismissing ? 'dismiss' : 'read',
        });
        expect(await action, isFalse);
        expect(current.state.notifications.single.read, isFalse);
        expect(current.state.notifications.single.id, 'private-owner-a');
        expect(
          adapter.requests.last.headers['Authorization'],
          'Bearer new-access',
        );
        expect(
          adapter.requests.where((request) => request.method == 'POST'),
          hasLength(1),
        );
      },
    );
  }

  for (final dismissing in [false, true]) {
    for (final uncertain in [false, true]) {
      test(
        'unread count refetches after ${dismissing ? 'dismiss' : 'read'} with uncertain=$uncertain and rejects an older count',
        () async {
          final olderCount = Completer<Map<String, dynamic>>();
          var countRequests = 0;
          final adapter = _Adapter((request) async {
            if (request.path.endsWith('/unread-count')) {
              if (countRequests++ == 0) return olderCount.future;
              return {'count': 0, 'unreadCount': 0};
            }
            if (request.method == 'POST') {
              if (uncertain) {
                throw DioException(
                  requestOptions: request,
                  type: DioExceptionType.receiveTimeout,
                );
              }
              return {
                'id': 'private-owner-a',
                'action': dismissing ? 'dismiss' : 'read',
              };
            }
            return _page('owner-a');
          });
          final container = _container(adapter);
          final subscription = container.listen(unreadCountProvider, (_, _) {});
          addTearDown(subscription.close);
          await _drain();
          final controller = container.read(
            notificationsControllerProvider.notifier,
          );
          await controller.loadNotifications();
          final confirmed = dismissing
              ? await controller.dismiss('private-owner-a')
              : await controller.markAsRead('private-owner-a');
          expect(confirmed, !uncertain);
          await container.pump();
          expect(await container.read(unreadCountProvider.future), 0);
          olderCount.complete({'count': 7, 'unreadCount': 7});
          await _drain();
          expect(container.read(unreadCountProvider).requireValue, 0);
          expect(countRequests, 2);
          if (uncertain) {
            expect(controller.state.notifications.single.read, isFalse);
          }
          expect(
            adapter.requests.every(
              (request) =>
                  request.headers['Authorization'] == 'Bearer token-owner-a',
            ),
            isTrue,
          );
        },
      );
    }
  }

  test(
    'expired member response clears private rows and requests authentication',
    () async {
      var expired = false;
      final adapter = _Adapter(
        (request) async => expired
            ? {
                'error': {'code': 'authentication_required'},
              }
            : _page('owner-a'),
      );
      final container = _container(adapter);
      final controller = container.read(
        notificationsControllerProvider.notifier,
      );
      await controller.loadNotifications();
      expect(
        container.read(notificationsControllerProvider).notifications,
        hasLength(1),
      );
      expired = true;
      adapter.status = 401;
      await controller.loadNotifications();
      expect(
        adapter.requests.last.headers['Authorization'],
        'Bearer token-owner-a',
      );
      expect(
        container.read(notificationsControllerProvider).authRequired,
        isTrue,
      );
      expect(
        container.read(notificationsControllerProvider).notifications,
        isEmpty,
      );
    },
  );
  test(
    'native notification pages use bearer auth and cursor without invented links',
    () async {
      final adapter = _Adapter(
        (request) async => {
          'items': [
            {
              'id': 'n1',
              'notificationType': 'appeals.appeal_resolved',
              'entityId': 'appeal-1',
              'title': 'Appeal resolved',
              'readAt': '2026-10-01T12:00:00Z',
              'createdAt': '2026-10-01T11:00:00Z',
            },
          ],
          'nextCursor': 'next-page',
          'totalUnread': 3,
        },
      );
      final container = _container(adapter);
      final service = container.read(notificationApiServiceProvider);
      final page = await service.getNotifications(
        continuationToken: 'previous-page',
      );
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer token-owner-a',
      );
      expect(adapter.requests.single.queryParameters, {
        'limit': 20,
        'cursor': 'previous-page',
      });
      expect(page.continuationToken, 'next-page');
      expect(page.notifications.single.userId, 'owner-a');
      expect(page.notifications.single.title, 'Appeal resolved');
      expect(page.notifications.single.read, isTrue);
      expect(page.notifications.single.deeplink, isNull);
      expect(page.notifications.single.targetId, 'appeal-1');
    },
  );

  test(
    'native preference acknowledgement round-trips only supported toggles',
    () async {
      final adapter = _Adapter((request) async => _nativePreferences);
      final container = _container(adapter);
      final service = container.read(notificationApiServiceProvider);
      final preferences = await service.getPreferences();
      expect(preferences.userId, 'owner-a');
      expect(preferences.toJson(), _nativePreferences);
      final saved = await service.updatePreferences(preferences);
      expect(saved.toJson(), _nativePreferences);
      expect(adapter.requests.last.method, 'PUT');
      expect(adapter.requests.last.data, _nativePreferences);
    },
  );

  test(
    'native devices expose no push token or fabricated last-seen time',
    () async {
      final adapter = _Adapter(
        (request) async => {
          'items': [
            {
              'id': 'device-a',
              'platform': 'web',
              'active': true,
              'created_at': '2026-10-01T12:00:00Z',
              'revoked_at': null,
            },
            {
              'id': 'revoked',
              'platform': 'ios',
              'active': false,
              'created_at': '2026-10-01T12:00:00Z',
              'revoked_at': '2026-10-02T12:00:00Z',
            },
          ],
        },
      );
      final container = _container(adapter);
      final devices = await container
          .read(notificationApiServiceProvider)
          .getDevices();
      expect(devices.map((device) => device.id), ['device-a']);
      expect(devices.single.userId, 'owner-a');
      expect(devices.single.pushToken, isNull);
      expect(devices.single.lastSeenAt, isNull);
    },
  );

  test('guest notification access stops before transport', () async {
    final adapter = _Adapter(
      (request) async => {
        'notifications': <Map<String, dynamic>>[],
        'totalUnread': 0,
      },
    );
    final container = _container(adapter);
    container.read(_session.notifier).state = null;
    await container.pump();
    await expectLater(
      container.read(notificationApiServiceProvider).getNotifications(),
      throwsA(isA<AuthRequiredException>()),
    );
    expect(adapter.requests, isEmpty);
  });

  test(
    'account switch cancels preferences and rejects late private state',
    () async {
      final first = Completer<Map<String, dynamic>>();
      final adapter = _Adapter(
        (request) async =>
            request.headers['Authorization'] == 'Bearer token-owner-b'
            ? {..._nativePreferences, 'emailEnabled': false}
            : first.future,
      );
      final container = _container(adapter);
      final subscription = container.listen(
        preferencesControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final oldController = container.read(
        preferencesControllerProvider.notifier,
      );
      await _drain();
      bool cancelled = false;
      adapter.cancellations.first?.then((_) => cancelled = true);
      container.read(_session.notifier).state = _user('owner-b');
      await container.pump();
      await _drain();
      expect(
        container.read(preferencesControllerProvider.notifier),
        isNot(same(oldController)),
      );
      expect(cancelled, isTrue);
      first.complete(_nativePreferences);
      await _drain();
      final preferences = container
          .read(preferencesControllerProvider)
          .valueOrNull;
      expect(preferences?.userId, 'owner-b');
      expect(preferences?.toJson()['emailEnabled'], isFalse);
    },
  );

  test(
    'sign-out during token retrieval never sends the old notification request',
    () async {
      final token = Completer<String?>();
      final adapter = _Adapter(
        (request) async => {
          'notifications': <Map<String, dynamic>>[],
          'totalUnread': 0,
        },
      );
      final container = _container(adapter, token: token.future);
      final subscription = container.listen(
        notificationApiServiceProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final request = container
          .read(notificationApiServiceProvider)
          .getNotifications();
      final rejection = expectLater(request, throwsA(isA<Exception>()));
      await _drain();
      container.read(_session.notifier).state = null;
      await container.pump();
      token.complete('old-token');
      await rejection;
      expect(adapter.requests, isEmpty);
    },
  );

  test(
    'notification lists clear on account change and discard late pages',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      var firstOwnerRead = true;
      final adapter = _Adapter((request) async {
        if (request.headers['Authorization'] == 'Bearer token-owner-b') {
          return _page('owner-b');
        }
        if (firstOwnerRead) {
          firstOwnerRead = false;
          return _page('owner-a');
        }
        return pending.future;
      });
      final container = _container(adapter);
      final subscription = container.listen(
        notificationsControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final old = container.read(notificationsControllerProvider.notifier);
      await old.loadNotifications();
      expect(
        container
            .read(notificationsControllerProvider)
            .notifications
            .single
            .userId,
        'owner-a',
      );
      final loading = old.loadNotifications();
      await _drain();
      container.read(_session.notifier).state = null;
      await container.pump();
      expect(
        container.read(notificationsControllerProvider).notifications,
        isEmpty,
      );
      await container
          .read(notificationsControllerProvider.notifier)
          .loadNotifications();
      expect(
        container.read(notificationsControllerProvider).authRequired,
        isTrue,
      );
      container.read(_session.notifier).state = _user('owner-b');
      await container.pump();
      final current = container.read(notificationsControllerProvider.notifier);
      expect(current, isNot(same(old)));
      expect(
        container.read(notificationApiServiceProvider).isCurrentSession,
        isTrue,
      );
      await current.loadNotifications();
      pending.complete({
        'items': [
          {
            'id': 'private-a',
            'notificationType': 'privacy_complete',
            'entityId': 'request-a',
            'title': 'Privacy request completed',
            'readAt': null,
            'createdAt': '2026-10-01T12:00:00Z',
          },
        ],
        'totalUnread': 1,
      });
      await loading;
      await _drain();
      expect(
        container
            .read(notificationsControllerProvider)
            .notifications
            .map((item) => item.userId),
        ['owner-b'],
      );
      expect(container.read(notificationsControllerProvider).hasError, isFalse);
    },
  );

  test(
    'device lists clear on account change and discard late private devices',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      final adapter = _Adapter(
        (request) async =>
            request.headers['Authorization'] == 'Bearer token-owner-b'
            ? {'items': <Map<String, dynamic>>[]}
            : pending.future,
      );
      final container = _container(adapter);
      final subscription = container.listen(
        devicesControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      await _drain();
      final old = container.read(devicesControllerProvider.notifier);
      container.read(_session.notifier).state = _user('owner-b');
      await container.pump();
      await _drain();
      expect(
        container.read(devicesControllerProvider.notifier),
        isNot(same(old)),
      );
      pending.complete({
        'items': [
          {
            'id': 'private-device-a',
            'platform': 'web',
            'active': true,
            'created_at': '2026-10-01T12:00:00Z',
            'revoked_at': null,
          },
        ],
      });
      await _drain();
      expect(container.read(devicesControllerProvider).requireValue, isEmpty);
    },
  );

  test(
    'a new account transport failure never retains the previous private list',
    () async {
      final failure = Completer<Map<String, dynamic>>();
      final adapter = _Adapter(
        (request) async =>
            request.headers['Authorization'] == 'Bearer token-owner-b'
            ? failure.future
            : _page('owner-a'),
      );
      final container = _container(adapter);
      final subscription = container.listen(
        notificationsControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      await container
          .read(notificationsControllerProvider.notifier)
          .loadNotifications();
      expect(
        container
            .read(notificationsControllerProvider)
            .notifications
            .single
            .userId,
        'owner-a',
      );
      container.read(_session.notifier).state = _user('owner-b');
      await container.pump();
      adapter.status = 503;
      final loading = container
          .read(notificationsControllerProvider.notifier)
          .loadNotifications();
      await _drain();
      expect(container.read(notificationsControllerProvider).isLoading, isTrue);
      expect(
        container.read(notificationsControllerProvider).notifications,
        isEmpty,
      );
      failure.complete({'error': 'temporarily_unavailable'});
      await loading;
      expect(
        container.read(notificationsControllerProvider).notifications,
        isEmpty,
      );
      expect(container.read(notificationsControllerProvider).hasError, isTrue);
      expect(
        container.read(notificationsControllerProvider).authRequired,
        isFalse,
      );
    },
  );

  test('refresh discards a late older page and keeps its new cursor', () async {
    final pending = Completer<Map<String, dynamic>>();
    var firstPage = 0;
    final adapter = _Adapter((request) async {
      if (request.queryParameters['cursor'] != null) return pending.future;
      firstPage++;
      return {
        'items': <Map<String, dynamic>>[],
        'nextCursor': 'cursor-$firstPage',
        'totalUnread': 0,
      };
    });
    final container = _container(adapter);
    final controller = container.read(notificationsControllerProvider.notifier);
    await controller.loadNotifications();
    final more = controller.loadMore();
    await _drain();
    await controller.loadNotifications();
    pending.complete({
      'items': [
        {
          'id': 'stale-page',
          'notificationType': 'privacy_complete',
          'entityId': 'request-a',
          'title': 'Privacy request completed',
          'readAt': null,
          'createdAt': '2026-10-01T12:00:00Z',
        },
      ],
      'nextCursor': null,
      'totalUnread': 1,
    });
    await more;
    expect(
      container.read(notificationsControllerProvider).continuationToken,
      'cursor-2',
    );
    expect(
      container.read(notificationsControllerProvider).notifications,
      isEmpty,
    );
  });

  test(
    'logout and same-account reentry fence old read and dismiss acknowledgements',
    () async {
      final read = Completer<Map<String, dynamic>>();
      final dismiss = Completer<Map<String, dynamic>>();
      final adapter = _Adapter((request) async {
        if (request.path.endsWith('/read')) return read.future;
        if (request.path.endsWith('/dismiss')) return dismiss.future;
        final page = _page('owner-a');
        final items = page['items'] as List;
        page['items'] = <Map<String, dynamic>>[
          ...items.cast<Map<String, dynamic>>(),
          {
            ...items.first as Map<String, dynamic>,
            'id': 'private-owner-a-second',
          },
        ];
        return page;
      });
      final container = _container(adapter);
      final subscription = container.listen(
        notificationsControllerProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final old = container.read(notificationsControllerProvider.notifier);
      await old.loadNotifications();
      expect(old.state.notifications, hasLength(2));
      final reading = old.markAsRead('private-owner-a');
      final dismissing = old.dismiss('private-owner-a-second');
      await _drain();
      expect(
        adapter.requests.where(
          (request) => request.path.endsWith('/private-owner-a/read'),
        ),
        hasLength(1),
      );
      expect(
        adapter.requests.where(
          (request) => request.path.endsWith('/private-owner-a-second/dismiss'),
        ),
        hasLength(1),
      );
      container.read(_session.notifier).state = null;
      await container.pump();
      expect(
        container.read(notificationsControllerProvider).notifications,
        isEmpty,
      );
      container.read(_session.notifier).state = _user('owner-a');
      await container.pump();
      final current = container.read(notificationsControllerProvider.notifier);
      expect(current, isNot(same(old)));
      await current.loadNotifications();
      read.complete({'id': 'private-owner-a', 'action': 'read'});
      dismiss.complete({'id': 'private-owner-a-second', 'action': 'dismiss'});
      expect(await Future.wait([reading, dismissing]), [false, false]);
      expect(
        container
            .read(notificationsControllerProvider)
            .notifications
            .map((notification) => notification.id),
        ['private-owner-a', 'private-owner-a-second'],
      );
      expect(
        container
            .read(notificationsControllerProvider)
            .notifications
            .every((notification) => !notification.read),
        isTrue,
      );
    },
  );
}

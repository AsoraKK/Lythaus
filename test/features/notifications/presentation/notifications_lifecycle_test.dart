import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';

import '../../../golden_test_utils.dart';

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

Map<String, Object?> _page(
  List<String> ids, {
  String? cursor,
  bool link = false,
  String destination = '/settings/notifications',
}) => {
  'items': [
    for (final id in ids)
      if (link)
        {
          'id': id,
          'userId': 'owner-a',
          'category': 'social',
          'eventType': 'comment_created',
          'title': 'Synthetic update $id',
          'body': 'Synthetic compatible notification',
          'deeplink': destination,
          'createdAt': '2026-10-01T12:00:00Z',
        }
      else
        {
          'id': id,
          'notificationType': 'privacy_complete',
          'title': 'Synthetic update $id',
          'readAt': null,
          'createdAt': '2026-10-01T12:00:00Z',
        },
  ],
  'nextCursor': cursor,
  'totalUnread': ids.length,
};

class _Reply {
  const _Reply(this.body, [this.status = 200]);
  final Object body;
  final int status;
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<_Reply> Function(RequestOptions) respond;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions request,
    Stream<List<int>>? stream,
    Future<void>? cancellation,
  ) async {
    requests.add(request);
    final reply = request.path.endsWith('/preferences')
        ? const _Reply(_preferences)
        : request.path.endsWith('/devices')
        ? const _Reply({'items': <Object?>[]})
        : await respond(request);
    return ResponseBody.fromString(
      jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Observer extends NavigatorObserver {
  int pushes = 0;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute) pushes++;
  }
}

Future<ProviderContainer> _open(
  WidgetTester tester,
  _Adapter adapter,
  Size size, {
  GlobalKey<NavigatorState>? navigator,
  _Observer? observer,
  GlobalKey? capture,
  bool pushed = false,
  AuthService? authService,
}) async {
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid/api'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      if (authService != null)
        enhancedAuthServiceProvider.overrideWithValue(authService),
      if (authService == null)
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(ref.read(_session.notifier)),
        ),
      if (authService == null)
        currentUserProvider.overrideWith((ref) => ref.watch(_session)),
      if (authService == null)
        guestModeProvider.overrideWith((ref) => ref.watch(_session) == null),
      if (authService == null)
        jwtProvider.overrideWith(
          (ref) async => 'token-${ref.watch(currentUserProvider)?.id}',
        ),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: RepaintBoundary(
        key: capture,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          navigatorKey: navigator,
          navigatorObservers: [if (observer != null) observer],
          home: pushed
              ? const Scaffold(body: Center(child: Text('Synthetic home')))
              : const NotificationsScreen(),
        ),
      ),
    ),
  );
  if (pushed) {
    navigator!.currentState!.push(
      MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()),
    );
  }
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  return container;
}

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final directory = Platform.environment['NOTIFICATION_SCREENSHOTS_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File('$directory/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

Finder get _unread => find.byWidgetPredicate(
  (widget) => widget is Semantics && widget.properties.label == 'Unread',
);

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  for (final size in [const Size(390, 844), const Size(1440, 1000)]) {
    final width = size.width.toInt();
    for (final revoked in [false, true]) {
      testWidgets(
        '$width: real same-owner refresh ${revoked ? 'recovers authentication-required rows' : 'fences an old navigation receipt'}',
        (tester) async {
          FlutterSecureStorage.setMockInitialValues({
            'jwt': 'old-access',
            'refreshToken': 'old-refresh',
          });
          final authRequests = <http.Request>[];
          final authClient = MockClient((request) async {
            authRequests.add(request);
            if (request.url.path.endsWith('/auth/userinfo')) {
              return http.Response(jsonEncode(_user('owner-a').toJson()), 200);
            }
            expectSync(request.url.path, '/api/auth/refresh');
            expectSync(jsonDecode(request.body), {
              'refreshToken': 'old-refresh',
            });
            return http.Response(
              jsonEncode({
                'accessToken': 'new-access',
                'refreshToken': 'new-refresh',
              }),
              200,
            );
          });
          addTearDown(authClient.close);
          final pending = Completer<_Reply>();
          final adapter = _Adapter((request) async {
            final fresh =
                request.headers['Authorization'] == 'Bearer new-access';
            if (request.path.endsWith('/read')) {
              if (fresh) {
                return const _Reply({'id': 'recovered', 'action': 'read'});
              }
              return revoked
                  ? const _Reply({'error': 'authentication_required'}, 401)
                  : pending.future;
            }
            return _Reply(_page([fresh ? 'recovered' : 'first'], link: true));
          });
          final observer = _Observer();
          final container = await _open(
            tester,
            adapter,
            size,
            observer: observer,
            authService: AuthService(
              httpClient: authClient,
              authUrl: 'https://local.invalid/api',
              useWebSession: false,
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('Synthetic update first'), findsOneWidget);
          await tester.tap(find.text('Synthetic update first'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 100));
          if (revoked) {
            await tester.pumpAndSettle();
            expect(
              find.text('Sign in to view your notifications.'),
              findsOneWidget,
            );
          }
          final revision = container.read(authSessionRevisionProvider);
          final version = container.read(tokenVersionProvider);
          final refresh = container
              .read(authStateProvider.notifier)
              .refreshToken();
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 100));
          await tester.pumpAndSettle();
          await refresh;
          expect(
            container.read(authStateProvider).hasError,
            isFalse,
            reason:
                '${container.read(authStateProvider).error} ${container.read(authStateProvider).stackTrace}',
          );
          expect(container.read(authSessionRevisionProvider), revision);
          expect(container.read(tokenVersionProvider), version + 1);
          expect(authRequests, hasLength(2));
          expect(authRequests.last.method, 'POST');
          expect(find.text('Synthetic update recovered'), findsOneWidget);
          expect(find.text('Synthetic update first'), findsNothing);
          if (!revoked) {
            pending.complete(const _Reply({'id': 'first', 'action': 'read'}));
            await tester.pumpAndSettle();
          }
          expect(find.byType(NotificationsSettingsScreen), findsNothing);
          expect(_unread, findsOneWidget);
          expect(observer.pushes, 1);
          expect(
            container.read(notificationsControllerProvider).authRequired,
            isFalse,
          );
          await tester.tap(find.text('Synthetic update recovered'));
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsSettingsScreen), findsOneWidget);
          expect(observer.pushes, 2);
          expect(
            adapter.requests.where((request) => request.path.endsWith('/read')),
            hasLength(2),
          );
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      '$width: failed read retries and unknown destination stays in the centre',
      (tester) async {
        var attempts = 0;
        final observer = _Observer();
        final adapter = _Adapter((request) async {
          if (request.path.endsWith('/read')) {
            if (attempts++ == 0) {
              throw DioException(
                requestOptions: request,
                type: DioExceptionType.receiveTimeout,
              );
            }
            return const _Reply({'id': 'first', 'action': 'read'});
          }
          return _Reply(
            _page(['first'], link: true, destination: '/unknown/synthetic'),
          );
        });
        await _open(tester, adapter, size, observer: observer);
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Notification actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Mark as read'));
        await tester.pumpAndSettle();
        expect(_unread, findsOneWidget);
        expect(
          find.text(
            'Could not confirm this notification was read. Please try again.',
          ),
          findsOneWidget,
        );
        await tester.pump(const Duration(seconds: 5));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Notification actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Mark as read'));
        await tester.pumpAndSettle();
        expect(attempts, 2);
        expect(_unread, findsNothing);
        await tester.tap(find.text('Synthetic update first'));
        await tester.pumpAndSettle();
        expect(
          find.text('This notification has no available destination.'),
          findsOneWidget,
        );
        expect(observer.pushes, 1);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('$width: loading becomes empty only after the response', (
      tester,
    ) async {
      final pending = Completer<_Reply>();
      await _open(tester, _Adapter((_) => pending.future), size);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('No Notifications'), findsNothing);
      pending.complete(_Reply(_page([])));
      await tester.pumpAndSettle();
      expect(find.text('No Notifications'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$width: pagination retries, deduplicates and continues', (
      tester,
    ) async {
      var attempts = 0;
      final adapter = _Adapter((request) async {
        final cursor = request.queryParameters['cursor'];
        if (cursor == null) return _Reply(_page(['first'], cursor: 'page-2'));
        if (cursor == 'page-2') {
          if (attempts++ == 0) return const _Reply({'error': 'synthetic'}, 503);
          return _Reply(_page(['first', 'second', 'second'], cursor: 'page-3'));
        }
        return _Reply(_page(['third']));
      });
      await _open(tester, adapter, size);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic update first'), findsOneWidget);
      await tester.tap(find.text('Retry loading'));
      await tester.pumpAndSettle();
      expect(find.text('Retry loading'), findsNothing);
      expect(find.text('Synthetic update first'), findsOneWidget);
      expect(find.text('Synthetic update second'), findsOneWidget);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic update third'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      '$width: failed refresh retries the first page with no cursor',
      (tester) async {
        var attempts = 0;
        final adapter = _Adapter((_) async {
          if (attempts++ == 1) return const _Reply({'error': 'synthetic'}, 503);
          return _Reply(_page(['first']));
        });
        final capture = GlobalKey();
        final container = await _open(tester, adapter, size, capture: capture);
        await tester.pumpAndSettle();
        final refresh = container
            .read(notificationsControllerProvider.notifier)
            .loadNotifications();
        await tester.pumpAndSettle();
        await refresh;
        expect(
          find.textContaining('Could not refresh notifications.'),
          findsOneWidget,
        );
        await _capture(tester, capture, 'refresh-error-$width');
        await tester.tap(find.text('Retry loading'));
        await tester.pumpAndSettle();
        expect(attempts, 3);
        expect(
          adapter.requests.every(
            (request) => request.queryParameters['cursor'] == null,
          ),
          isTrue,
        );
        expect(find.text('Retry loading'), findsNothing);
        expect(find.text('Synthetic update first'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      '$width: uncertain dismissal retains the row until an explicit read',
      (tester) async {
        var dismissed = false;
        final adapter = _Adapter((request) async {
          if (request.path.endsWith('/dismiss')) {
            dismissed = true;
            throw DioException(
              requestOptions: request,
              type: DioExceptionType.receiveTimeout,
            );
          }
          return _Reply(_page(dismissed ? [] : ['first']));
        });
        final capture = GlobalKey();
        final container = await _open(tester, adapter, size, capture: capture);
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Notification actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Dismiss notification'));
        await tester.pumpAndSettle();
        expect(find.text('Synthetic update first'), findsOneWidget);
        expect(
          find.text(
            'Could not confirm dismissal. Please refresh or try again.',
          ),
          findsOneWidget,
        );
        await _capture(tester, capture, 'unconfirmed-dismiss-$width');
        final refresh = container
            .read(notificationsControllerProvider.notifier)
            .loadNotifications();
        await tester.pumpAndSettle();
        await refresh;
        expect(find.text('Synthetic update first'), findsNothing);
        expect(find.text('No Notifications'), findsOneWidget);
        expect(
          adapter.requests.where((request) => request.method == 'POST'),
          hasLength(1),
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      '$width: repeated taps push one destination and Back returns once',
      (tester) async {
        final pending = Completer<_Reply>();
        final adapter = _Adapter((request) async {
          if (request.path.endsWith('/read')) return pending.future;
          return _Reply(_page(['first'], link: true));
        });
        final navigator = GlobalKey<NavigatorState>();
        final observer = _Observer();
        await _open(
          tester,
          adapter,
          size,
          navigator: navigator,
          observer: observer,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Synthetic update first'));
        await tester.tap(find.text('Synthetic update first'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          adapter.requests.where((request) => request.path.endsWith('/read')),
          hasLength(1),
        );
        expect(find.byType(NotificationsSettingsScreen), findsNothing);
        pending.complete(const _Reply({'id': 'first', 'action': 'read'}));
        await tester.pumpAndSettle();
        expect(find.byType(NotificationsSettingsScreen), findsOneWidget);
        expect(observer.pushes, 2);
        expect(find.text('Quiet hours are not available yet.'), findsOneWidget);
        navigator.currentState!.pop();
        await tester.pumpAndSettle();
        expect(find.byType(NotificationsScreen), findsOneWidget);
        expect(_unread, findsNothing);
        final openAgain = tester
            .widget<InkWell>(
              find
                  .ancestor(
                    of: find.text('Synthetic update first'),
                    matching: find.byType(InkWell),
                  )
                  .first,
            )
            .onTap!;
        openAgain();
        openAgain();
        await tester.pumpAndSettle();
        expect(observer.pushes, 3);
        navigator.currentState!.pop();
        await tester.pumpAndSettle();
        expect(find.byType(NotificationsScreen), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    for (final pop in [false, true]) {
      testWidgets(
        '$width: late acknowledgement cannot navigate after ${pop ? 'Back' : 'another route'}',
        (tester) async {
          final pending = Completer<_Reply>();
          final adapter = _Adapter((request) async {
            if (request.path.endsWith('/read')) return pending.future;
            return _Reply(_page(['first'], link: true));
          });
          final navigator = GlobalKey<NavigatorState>();
          await _open(tester, adapter, size, navigator: navigator, pushed: pop);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Synthetic update first'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 100));
          expect(
            adapter.requests.where((request) => request.path.endsWith('/read')),
            hasLength(1),
          );
          if (pop) {
            navigator.currentState!.pop();
          } else {
            navigator.currentState!.push(
              MaterialPageRoute<void>(
                builder: (_) =>
                    const Scaffold(body: Text('Synthetic next route')),
              ),
            );
          }
          await tester.pumpAndSettle();
          pending.complete(const _Reply({'id': 'first', 'action': 'read'}));
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsSettingsScreen), findsNothing);
          expect(
            find.text(pop ? 'Synthetic home' : 'Synthetic next route'),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }

    for (final settleOtherRoute in [true, false]) {
      testWidgets(
        '$width: push then Back before ${settleOtherRoute ? 'delayed' : 'immediate'} read receipt cancels old navigation',
        (tester) async {
          final pending = Completer<_Reply>();
          final adapter = _Adapter((request) async {
            if (request.path.endsWith('/read')) return pending.future;
            return _Reply(_page(['first'], link: true));
          });
          final navigator = GlobalKey<NavigatorState>();
          final observer = _Observer();
          final container = await _open(
            tester,
            adapter,
            size,
            navigator: navigator,
            observer: observer,
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text('Synthetic update first'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 100));
          expect(
            adapter.requests.where((request) => request.path.endsWith('/read')),
            hasLength(1),
          );
          navigator.currentState!.push(
            MaterialPageRoute<void>(
              builder: (_) =>
                  const Scaffold(body: Text('Synthetic temporary route')),
            ),
          );
          if (settleOtherRoute) {
            await tester.pumpAndSettle();
            expect(find.text('Synthetic temporary route'), findsOneWidget);
          }
          navigator.currentState!.pop();
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsScreen), findsOneWidget);
          expect(_unread, findsOneWidget);
          pending.complete(const _Reply({'id': 'first', 'action': 'read'}));
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsSettingsScreen), findsNothing);
          expect(find.byType(NotificationsScreen), findsOneWidget);
          expect(observer.pushes, 2);
          expect(_unread, findsNothing);
          expect(
            container
                .read(notificationsControllerProvider)
                .notifications
                .single
                .read,
            isTrue,
          );
          await tester.tap(find.text('Synthetic update first'));
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsSettingsScreen), findsOneWidget);
          expect(observer.pushes, 3);
          expect(
            adapter.requests.where((request) => request.path.endsWith('/read')),
            hasLength(1),
          );
          navigator.currentState!.pop();
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsScreen), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      '$width: A to B to A rejects an old action and resets busy state',
      (tester) async {
        final pending = Completer<_Reply>();
        final adapter = _Adapter((request) async {
          if (request.path.endsWith('/read')) return pending.future;
          final owner =
              request.headers['Authorization'] == 'Bearer token-owner-b'
              ? 'b'
              : 'a';
          return _Reply(_page(['owner-$owner']));
        });
        final container = await _open(tester, adapter, size);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Synthetic update owner-a'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          adapter.requests.where((request) => request.path.endsWith('/read')),
          hasLength(1),
        );
        container.read(_session.notifier).state = _user('owner-b');
        await tester.pumpAndSettle();
        expect(find.text('Synthetic update owner-a'), findsNothing);
        expect(find.text('Synthetic update owner-b'), findsOneWidget);
        container.read(_session.notifier).state = _user('owner-a');
        await tester.pumpAndSettle();
        pending.complete(const _Reply({'id': 'owner-a', 'action': 'read'}));
        await tester.pumpAndSettle();
        expect(find.text('Synthetic update owner-b'), findsNothing);
        expect(_unread, findsOneWidget);
        expect(
          find.text('This notification has no available destination.'),
          findsNothing,
        );
        await tester.tap(find.byTooltip('Notification actions'));
        await tester.pumpAndSettle();
        expect(find.text('Mark as read'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      '$width: revoked mutation clears rows and blocks stale refresh',
      (tester) async {
        final pending = Completer<_Reply>();
        var loads = 0;
        final adapter = _Adapter((request) async {
          if (request.path.endsWith('/unread-count')) {
            return const _Reply({'count': 0, 'unreadCount': 0});
          }
          if (request.path.endsWith('/read')) {
            return const _Reply({'error': 'authentication_required'}, 401);
          }
          if (++loads > 1) return pending.future;
          return _Reply(_page(['first']));
        });
        final container = await _open(tester, adapter, size);
        await tester.pumpAndSettle();
        final refresh = container
            .read(notificationsControllerProvider.notifier)
            .loadNotifications();
        await tester.pump();
        await tester.tap(find.text('Synthetic update first'));
        await tester.pumpAndSettle();
        expect(
          find.text('Sign in to view your notifications.'),
          findsOneWidget,
        );
        pending.complete(_Reply(_page(['first'])));
        await tester.pumpAndSettle();
        await refresh;
        await tester.pumpAndSettle();
        expect(find.text('Synthetic update first'), findsNothing);
        expect(
          find.text('This notification has no available destination.'),
          findsNothing,
        );
        container.read(_session.notifier).state = null;
        await tester.pumpAndSettle();
        expect(
          find.text('Sign in to view your notifications.'),
          findsOneWidget,
        );
        expect(loads, 2);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

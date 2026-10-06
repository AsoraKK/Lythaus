import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:lythaus/services/service_providers.dart';

import 'test_doubles.dart';

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Auth extends AuthService {
  @override
  Future<User?> getCurrentUser() async => _user('a');
  @override
  Future<void> logout() async {}
}

ResponseBody _json(Object value, [int status = 200]) => ResponseBody.fromString(
  jsonEncode(value),
  status,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
  },
);

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  Future<ResponseBody> Function(RequestOptions)? respond;
  final cancelled = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    unawaited(cancelFuture?.then((_) => cancelled.add(options)));
    if (respond != null) return respond!(options);
    return defaultResponse(options);
  }

  ResponseBody defaultResponse(RequestOptions options) {
    final owner = (options.headers['Authorization'] as String).split('-').last;
    final type = options.uri.queryParameters['requestType'] ?? 'export';
    if (options.method == 'POST') {
      final mutation = (options.data as Map<String, dynamic>)['requestType'];
      return _json({
        'requestId': '$owner-$mutation',
        'requestType': mutation,
        'state': 'received',
        'acceptedAt': '2026-10-02T12:00:00Z',
      }, 202);
    }
    if (owner == 'b' || type == 'delete') {
      return _json({'request': null, 'retryAfterSeconds': 0});
    }
    return _json({
      'retryAfterSeconds': 29 * 86400,
      'request': {
        'requestId': '$owner-export',
        'requestType': 'export',
        'state': 'completed',
        'acceptedAt': '2026-10-02T12:00:00Z',
        'completedAt': '2026-10-02T12:30:00Z',
      },
    });
  }

  @override
  void close({bool force = false}) {}
}

class _Harness {
  final adapter = _Adapter();
  final storage = MemoryPrivacyStorage();
  Future<String?>? pendingToken;
  late final ProviderContainer container = ProviderContainer(
    overrides: [
      enhancedAuthServiceProvider.overrideWithValue(_Auth()),
      secureDioProvider.overrideWithValue(
        Dio(BaseOptions(baseUrl: 'https://synthetic.invalid/api'))
          ..httpClientAdapter = adapter,
      ),
      secureStorageProvider.overrideWithValue(storage),
      analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      jwtProvider.overrideWith((ref) async {
        ref.watch(tokenVersionProvider);
        final owner = ref.watch(currentUserProvider)?.id;
        return pendingToken ?? (owner == null ? null : 'synthetic-$owner');
      }),
    ],
  );
  ProviderSubscription<PrivacyState>? subscription;
  Future<PrivacyController> start() async {
    container.read(authStateProvider.notifier);
    await container.pump();
    subscription = container.listen(privacyControllerProvider, (_, _) {});
    final controller = container.read(privacyControllerProvider.notifier);
    await controller.refreshStatus();
    return controller;
  }

  Future<PrivacyController> switchTo(String id, {bool rapid = false}) async {
    final auth = container.read(authStateProvider.notifier);
    if (rapid) unawaited(auth.signOut());
    pendingToken = null;
    auth.setUser(_user(id));
    await container.pump();
    return container.read(privacyControllerProvider.notifier);
  }

  PrivacyState get state => container.read(privacyControllerProvider);
  Future<void> settleUntil(bool Function() condition) async {
    for (var i = 0; i < 30 && !condition(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    expect(
      condition(),
      isTrue,
      reason:
          'The synthetic operation must enter transport before interruption.',
    );
  }

  void dispose() {
    subscription?.close();
    container.dispose();
  }
}

void main() {
  test(
    'canonical auth switching clears request metadata and scopes cached timestamps',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.start();
      expect(h.state.requestId, 'a-export');
      expect(h.state.canRequestExport, isFalse);
      expect(h.storage.values['privacy.lastExportAt.v2.a'], isNotNull);
      final b = await h.switchTo('b');
      expect(h.state.requestId, isNull);
      expect(h.state.lastExportAt, isNull);
      expect(h.state.canRequestExport, isFalse);
      await b.refreshStatus();
      expect(h.state.exportStatus, ExportStatus.idle);
      expect(h.state.canRequestExport, isTrue);
      expect(h.storage.values['privacy.lastExportAt.v2.b'], isNull);
      expect(h.storage.values['privacy.lastExportAt.v2.a'], isNotNull);
    },
  );

  for (final replacement in ['a', 'b']) {
    test(
      'late status cannot leak into rapid replacement $replacement',
      () async {
        final h = _Harness();
        addTearDown(h.dispose);
        final old = await h.start();
        final pending = Completer<ResponseBody>();
        RequestOptions? held;
        h.adapter.respond = (options) async {
          if (held == null) {
            held = options;
            return pending.future;
          }
          return h.adapter.defaultResponse(options);
        };
        final refreshing = old.refreshStatus();
        await h.settleUntil(() => held != null);
        final current = await h.switchTo(replacement, rapid: true);
        expect(old.isCurrentSession, isFalse);
        expect(current, isNot(same(old)));
        await current.refreshStatus();
        final expected = h.state;
        pending.complete(h.adapter.defaultResponse(held!));
        await refreshing;
        expect(h.state.requestId, expected.requestId);
        expect(h.state.lastExportAt, expected.lastExportAt);
        expect(h.state.error, expected.error);
        expect(h.adapter.cancelled, contains(held));
      },
    );
  }

  test('late unauthorized A acknowledgement never signs out B', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    final old = await h.start();
    final pending = Completer<ResponseBody>();
    RequestOptions? held;
    h.adapter.respond = (options) async {
      if (options.method == 'POST') {
        held = options;
        return pending.future;
      }
      return h.adapter.defaultResponse(options);
    };
    final deletion = old.delete();
    await h.settleUntil(() => held != null);
    final b = await h.switchTo('b');
    await b.refreshStatus();
    pending.complete(_json({'error': 'unauthorized'}, 401));
    await deletion;
    expect(h.container.read(currentUserProvider)?.id, 'b');
    expect(h.state.isGuest, isFalse);
    expect(h.state.error, isNull);
  });

  test(
    'logout cancels waiting token retrieval before submitting an old action',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      final old = await h.start();
      final token = Completer<String?>();
      h.pendingToken = token.future;
      h.container.invalidate(jwtProvider);
      final deletion = old.delete();
      await h.container.read(authStateProvider.notifier).signOut();
      await h.container.pump();
      await deletion;
      expect(h.state.isGuest, isTrue);
      expect(h.adapter.requests.where((r) => r.method == 'POST'), isEmpty);
      token.complete('synthetic-a');
      await h.container.pump();
      expect(h.adapter.requests.where((r) => r.method == 'POST'), isEmpty);
    },
  );

  test(
    'late verified download bytes are discarded after account replacement',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      final old = await h.start();
      final pending = Completer<ResponseBody>();
      RequestOptions? held;
      h.adapter.respond = (options) async {
        if (options.path.endsWith('/export')) {
          held = options;
          return pending.future;
        }
        return h.adapter.defaultResponse(options);
      };
      final download = old.download();
      await h.settleUntil(() => held != null);
      final b = await h.switchTo('b');
      await b.refreshStatus();
      final bytes = utf8.encode('{"owner":"a"}');
      pending.complete(
        ResponseBody.fromBytes(
          bytes,
          200,
          headers: {
            'x-content-sha256': [sha256.convert(bytes).toString()],
          },
        ),
      );
      expect(await download, isNull);
      expect(h.state.requestId, isNull);
      expect(h.state.canDownload, isFalse);
      expect(
        h.storage.values.values.any((v) => v?.contains('owner') == true),
        isFalse,
      );
    },
  );

  test(
    'repeated actions and cancelled confirmation do not duplicate mutations',
    () async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.start();
      final current = await h.switchTo('b');
      await current.refreshStatus();
      current.beginDeleteConfirmation();
      current.cancelDeleteConfirmation();
      expect(h.adapter.requests.where((r) => r.method == 'POST'), isEmpty);
      final pending = Completer<ResponseBody>();
      RequestOptions? held;
      h.adapter.respond = (options) async {
        if (options.method == 'POST') {
          held = options;
          return pending.future;
        }
        return h.adapter.defaultResponse(options);
      };
      final export = current.export();
      await h.settleUntil(() => held != null);
      await current.export();
      await current.delete();
      await current.refreshStatus();
      expect(h.adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
      pending.complete(h.adapter.defaultResponse(held!));
      await export;
      expect(h.state.exportStatus, ExportStatus.received);
      expect(h.state.requestId, 'b-export');
      expect(h.state.canRequestExport, isFalse);
    },
  );
}

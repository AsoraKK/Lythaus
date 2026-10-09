import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import '../../../support/monthly_rewards_fixture.dart';

class _MonthlyAdapter implements HttpClientAdapter {
  _MonthlyAdapter(this.respond);
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
    cancellations.add(cancelFuture);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object? value) => ResponseBody.fromString(
  jsonEncode(value),
  200,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);
Future<T> _read<T>(
  ProviderContainer container,
  AutoDisposeFutureProvider<T> provider,
) async {
  final subscription = container.listen(provider, (_, _) {});
  try {
    return await container.read(provider.future);
  } finally {
    subscription.close();
  }
}

ProviderContainer _container(_MonthlyAdapter adapter, {bool guest = false}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://synthetic.invalid'))
    ..httpClientAdapter = adapter;
  final container = ProviderContainer(
    overrides: [
      authSessionRevisionProvider.overrideWith(
        (ref) => AuthSessionRevision(ref.read(monthlyTestSession.notifier)),
      ),
      currentUserProvider.overrideWith((ref) => ref.watch(monthlyTestSession)),
      guestModeProvider.overrideWith((ref) => guest),
      jwtProvider.overrideWith(
        (ref) async => 'synthetic-${ref.watch(currentUserProvider)?.id}',
      ),
      secureDioProvider.overrideWithValue(dio),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test(
    'actual generated operations return typed own responses without policy selectors',
    () async {
      final adapter = _MonthlyAdapter(
        (request) async => _json(
          request.path == '/rewards/me/monthly'
              ? monthlyStatusWire()
              : monthlyReportWire('2026-12'),
        ),
      );
      final container = _container(adapter);
      expect(
        await _read(container, monthlyRewardsViewProvider),
        isA<api.MonthlyRewardsMeResponse>(),
      );
      expect(
        (await _read(
          container,
          monthlyReputationReportProvider('2026-12'),
        )).sourceMonth,
        '2026-12',
      );
      expect(adapter.requests.map((request) => request.path), [
        '/rewards/me/monthly',
        '/reputation/me/reports/monthly/2026-12',
      ]);
      for (final request in adapter.requests) {
        expect(request.method, 'GET');
        expect(request.queryParameters, isEmpty);
        expect(request.headers['Authorization'], 'Bearer synthetic-owner-a');
        expect(request.data, isNull);
      }
    },
  );
  test(
    'guest with transient owner state cannot fetch private monthly evidence',
    () async {
      final adapter = _MonthlyAdapter((_) async => _json(monthlyStatusWire()));
      final container = _container(adapter, guest: true);
      await expectLater(
        _read(container, monthlyRewardsViewProvider),
        throwsStateError,
      );
      await expectLater(
        _read(container, monthlyReputationReportProvider('2026-10')),
        throwsStateError,
      );
      await expectLater(
        _read(container, monthlyReputationCsvProvider('2026-10')),
        throwsStateError,
      );
      expect(adapter.requests, isEmpty);
    },
  );
  test(
    'wrong source month and malformed request fail without inferred evidence',
    () async {
      final adapter = _MonthlyAdapter(
        (_) async => _json(monthlyReportWire('2026-11')),
      );
      final container = _container(adapter);
      await expectLater(
        _read(container, monthlyReputationReportProvider('2026-10')),
        throwsStateError,
      );
      await expectLater(
        _read(container, monthlyReputationReportProvider('2026-13')),
        throwsArgumentError,
      );
      expect(adapter.requests, hasLength(1));
    },
  );
  test('canonical integer decoder refuses fractional authority', () async {
    final adapter = _MonthlyAdapter(
      (_) async => _json(monthlyStatusWire()..['currentLevel'] = 3.5),
    );
    final container = _container(adapter);
    await expectLater(
      _read(container, monthlyRewardsViewProvider),
      throwsA(isA<DioException>()),
    );
  });
  for (final endpoint in ['status', 'report', 'csv']) {
    test(
      '$endpoint cancels rapid owner-null-owner reentry and rejects late response',
      () async {
        final started = Completer<void>();
        final delayed = Completer<ResponseBody>();
        var requests = 0;
        final adapter = _MonthlyAdapter((request) async {
          requests++;
          if (!started.isCompleted) started.complete();
          if (requests == 1) return delayed.future;
          return endpoint == 'csv'
              ? ResponseBody.fromBytes([], 200)
              : _json(
                  endpoint == 'status'
                      ? monthlyStatusWire()
                      : monthlyReportWire('2026-10'),
                );
        });
        final container = _container(adapter);
        final Future<Object?> pending = switch (endpoint) {
          'status' => _read(container, monthlyRewardsViewProvider),
          'report' => _read(
            container,
            monthlyReputationReportProvider('2026-10'),
          ),
          _ => _read(container, monthlyReputationCsvProvider('2026-10')),
        };
        final outcome = pending.then<Object?>(
          (value) => value,
          onError: (Object error, StackTrace _) => error,
        );
        await started.future;
        final cancelled = Completer<void>();
        adapter.cancellations.first!.then((_) => cancelled.complete());
        container.read(monthlyTestSession.notifier).state = null;
        container.read(monthlyTestSession.notifier).state = monthlyTestUser(
          'owner-a',
        );
        await cancelled.future;
        delayed.complete(_json(monthlyStatusWire(confirmed: true)));
        final result = await outcome;
        if (result is DioException) {
          expect(result.type, DioExceptionType.cancel);
        } else if (result is api.MonthlyRewardsMeResponse) {
          expect(result.currentLevel, isNull);
        } else if (result is api.MonthlyReputationReportResponse) {
          expect(result.report, isNull);
        } else {
          expect(result, isEmpty);
        }
        await Future<void>.delayed(Duration.zero);
      },
    );
  }
}

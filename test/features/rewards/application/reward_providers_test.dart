import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

final _session = StateProvider<User?>((ref) => null);

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = <RequestOptions>[];
  final List<Future<void>?> cancellations = <Future<void>?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    cancellations.add(cancelFuture);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWith(_Adapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  dio.interceptors.add(IdempotencyRetryInterceptor(dio));
  return dio;
}

ProviderContainer _container(
  _Adapter adapter, {
  User? user,
  String? Function(User?)? tokenForUser,
}) => ProviderContainer(
  overrides: [
    _session.overrideWith((ref) => user),
    authSessionRevisionProvider.overrideWith(
      (ref) => AuthSessionRevision(ref.read(_session.notifier)),
    ),
    currentUserProvider.overrideWith((ref) => ref.watch(_session)),
    jwtProvider.overrideWith((ref) async {
      final currentUser = ref.watch(currentUserProvider);
      return tokenForUser == null
          ? currentUser == null
                ? null
                : 'session-${currentUser.id}'
          : tokenForUser(currentUser);
    }),
    secureDioProvider.overrideWithValue(_dioWith(adapter)),
  ],
);

Map<String, dynamic> _snapshotPayload({int reputationLevel = 3}) => {
  'subscriptionTier': 'premium',
  'reputationLevel': reputationLevel,
  'reputationBand': 'established',
  'availableRewardLevels': [1, 2, 3, 4, 5],
  'maxOptionsPerLevel': 1,
  'redemptionStatus': 'active',
  'fraudRiskStatus': 'normal',
  'offers': [
    {
      'id': 'lvl1-privacy-basics',
      'rewardLevel': 1,
      'title': 'Privacy Starter Pack',
      'description': 'desc',
      'partnerName': 'Partner',
      'locked': false,
      'redeemed': false,
    },
  ],
  'redemptionHistory': <Map<String, dynamic>>[],
  'affiliateDisclosure': 'affiliate text',
};

ResponseBody _jsonResponse(Map<String, dynamic> payload, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(payload),
      status,
      headers: {
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );

Map<String, dynamic> _redemptionPayload() => {
  'id': 'r1',
  'rewardId': 'lvl1-privacy-basics',
  'rewardLevel': 1,
  'rewardTitle': 'Privacy Starter Pack',
  'redeemedAt': '2026-05-27T00:00:00.000Z',
  'status': 'redeemed',
};

Future<RewardsSnapshot> _readSnapshot(ProviderContainer container) async {
  final sessionRevision = container.read(authSessionRevisionProvider);
  final provider = rewardsSnapshotProvider(sessionRevision);
  final subscription = container.listen(provider, (_, _) {});
  try {
    return await container.read(provider.future);
  } finally {
    subscription.close();
  }
}

RewardRedemptionRequest _redemptionRequest(
  ProviderContainer container,
  String rewardId,
) => (
  rewardId: rewardId,
  sessionRevision: container.read(authSessionRevisionProvider),
  idempotencyKey: IdempotencyKey.create('reward.redeem'),
);

void main() {
  group('rewardsSnapshotProvider', () {
    test('parses the authenticated rewards snapshot', () async {
      final adapter = _Adapter((_) async => _jsonResponse(_snapshotPayload()));
      final container = _container(adapter, user: _user('account-a'));
      addTearDown(container.dispose);

      final snapshot = await _readSnapshot(container);

      expect(snapshot.subscriptionTier, 'premium');
      expect(snapshot.reputationLevel, 3);
      expect(snapshot.offers.single.title, 'Privacy Starter Pack');
      expect(adapter.requests.single.path, '/rewards/me');
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer session-account-a',
      );
    });

    test('guest access fails without making a request', () async {
      final adapter = _Adapter((_) async => _jsonResponse(_snapshotPayload()));
      final container = _container(adapter);
      addTearDown(container.dispose);

      await expectLater(
        _readSnapshot(container),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'Sign in to view rewards',
          ),
        ),
      );
      expect(adapter.requests, isEmpty);
    });

    test(
      'a missing token reports an expired session without a request',
      () async {
        final adapter = _Adapter(
          (_) async => _jsonResponse(_snapshotPayload()),
        );
        final container = _container(
          adapter,
          user: _user('account-a'),
          tokenForUser: (_) => null,
        );
        addTearDown(container.dispose);

        await expectLater(
          _readSnapshot(container),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              'Session expired',
            ),
          ),
        );
        expect(adapter.requests, isEmpty);
      },
    );

    test(
      'account changes cancel old reads and clear cached account data',
      () async {
        final accountAResponse = Completer<ResponseBody>();
        final accountARefreshStarted = Completer<void>();
        var accountARequests = 0;
        final adapter = _Adapter((request) {
          if (request.headers['Authorization'] == 'Bearer session-account-a') {
            accountARequests += 1;
            if (accountARequests == 1) {
              return Future.value(
                _jsonResponse(_snapshotPayload(reputationLevel: 1)),
              );
            }
            if (!accountARefreshStarted.isCompleted) {
              accountARefreshStarted.complete();
            }
            return accountAResponse.future;
          }
          return Future.value(
            _jsonResponse(_snapshotPayload(reputationLevel: 2)),
          );
        });
        final container = _container(adapter, user: _user('account-a'));
        addTearDown(container.dispose);
        final observedStates = <AsyncValue<RewardsSnapshot>>[];
        final guestErrorState = Completer<void>();
        final accountAProvider = rewardsSnapshotProvider(
          container.read(authSessionRevisionProvider),
        );
        final subscription = container.listen(accountAProvider, (_, next) {
          observedStates.add(next);
          if (next.hasError && !guestErrorState.isCompleted) {
            guestErrorState.complete();
          }
        }, fireImmediately: true);
        addTearDown(subscription.close);

        final accountA = await container.read(accountAProvider.future);
        expect(accountA.reputationLevel, 1);

        container.invalidate(accountAProvider);
        final pendingAccountARead = container.read(accountAProvider.future);
        final pendingAccountAOutcome = pendingAccountARead.then<Object?>(
          (snapshot) => snapshot,
          onError: (Object error, StackTrace stackTrace) => error,
        );
        await accountARefreshStarted.future;
        expect(adapter.requests, hasLength(2));

        container.read(_session.notifier).state = null;
        expect(container.read(authSessionRevisionProvider), 1);
        expect(container.read(currentUserProvider), isNull);
        await guestErrorState.future.timeout(const Duration(seconds: 1));
        expect(observedStates.any((state) => state.hasError), isTrue);
        final guestProvider = rewardsSnapshotProvider(
          container.read(authSessionRevisionProvider),
        );
        await expectLater(
          container.read(guestProvider.future),
          throwsA(isA<StateError>()),
        );
        expect(container.read(guestProvider).valueOrNull, isNull);
        expect(adapter.requests, hasLength(2));
        expect(adapter.cancellations.last, isNotNull);
        await adapter.cancellations.last!.timeout(const Duration(seconds: 1));
        subscription.close();

        container.read(_session.notifier).state = _user('account-b');
        final accountBProvider = rewardsSnapshotProvider(
          container.read(authSessionRevisionProvider),
        );
        final accountBSubscription = container.listen(
          accountBProvider,
          (_, _) {},
        );
        final accountB = await container.read(accountBProvider.future);
        expect(accountB.reputationLevel, 2);
        expect(adapter.requests, hasLength(3));
        expect(
          adapter.requests.last.headers['Authorization'],
          'Bearer session-account-b',
        );

        accountAResponse.complete(
          _jsonResponse(_snapshotPayload(reputationLevel: 1)),
        );
        final staleRead = await pendingAccountAOutcome;
        if (staleRead is RewardsSnapshot) {
          expect(staleRead.reputationLevel, isNot(1));
        }
        await Future<void>.delayed(Duration.zero);
        expect(container.read(accountBProvider).value?.reputationLevel, 2);
        accountBSubscription.close();
      },
    );

    test('surfaces authentication failures as request errors', () async {
      final adapter = _Adapter(
        (_) async => _jsonResponse({'error': 'authentication_required'}, 401),
      );
      final container = _container(adapter, user: _user('account-a'));
      addTearDown(container.dispose);

      await expectLater(
        _readSnapshot(container),
        throwsA(
          isA<DioException>().having(
            (error) => error.response?.statusCode,
            'statusCode',
            401,
          ),
        ),
      );
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer session-account-a',
      );
    });
  });

  group('redeemRewardProvider', () {
    test('posts an authenticated redemption and parses the response', () async {
      final adapter = _Adapter(
        (_) async => _jsonResponse(_redemptionPayload(), 201),
      );
      final container = _container(adapter, user: _user('account-a'));
      addTearDown(container.dispose);

      final request = _redemptionRequest(container, 'lvl1-privacy-basics');
      final provider = redeemRewardProvider(request);
      final subscription = container.listen(provider, (_, _) {});
      final redemption = await container.read(provider.future);
      subscription.close();

      expect(adapter.requests.single.method, 'POST');
      expect(
        adapter.requests.single.path,
        '/rewards/lvl1-privacy-basics/redeem',
      );
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer session-account-a',
      );
      expect(
        adapter.requests.single.headers['Idempotency-Key'],
        request.idempotencyKey,
      );
      expect(redemption.rewardId, 'lvl1-privacy-basics');
      expect(redemption.status, 'redeemed');
    });

    test('guest access fails without making a redemption request', () async {
      final adapter = _Adapter(
        (_) async => _jsonResponse(_redemptionPayload(), 201),
      );
      final container = _container(adapter);
      addTearDown(container.dispose);
      final provider = redeemRewardProvider(
        _redemptionRequest(container, 'lvl1-privacy-basics'),
      );
      final subscription = container.listen(provider, (_, _) {});

      await expectLater(
        container.read(provider.future),
        throwsA(isA<StateError>()),
      );
      expect(adapter.requests, isEmpty);
      subscription.close();
    });

    test(
      'a failed redemption can be explicitly retried with the session',
      () async {
        var attempts = 0;
        final adapter = _Adapter((_) async {
          attempts += 1;
          return attempts == 1
              ? _jsonResponse({'error': 'temporarily_unavailable'}, 503)
              : _jsonResponse(_redemptionPayload(), 201);
        });
        final container = _container(adapter, user: _user('account-a'));
        addTearDown(container.dispose);
        final request = _redemptionRequest(container, 'lvl1-privacy-basics');
        final provider = redeemRewardProvider(request);
        final subscription = container.listen(provider, (_, _) {});

        await expectLater(
          container.read(provider.future),
          throwsA(
            isA<DioException>().having(
              (error) => error.response?.statusCode,
              'statusCode',
              503,
            ),
          ),
        );
        expect(attempts, 1);

        container.invalidate(provider);
        final redemption = await container.read(provider.future);

        expect(redemption.status, 'redeemed');
        expect(attempts, 2);
        expect(
          adapter.requests.map((request) => request.headers['Authorization']),
          everyElement('Bearer session-account-a'),
        );
        expect(
          adapter.requests.map((request) => request.headers['Idempotency-Key']),
          everyElement(request.idempotencyKey),
        );
        subscription.close();
      },
    );

    test(
      'lost response requires manual retry with the same idempotency key',
      () async {
        final attempts = <RequestOptions>[];
        ResponseBody? committedResponse;
        final adapter = _Adapter((options) async {
          attempts.add(options);
          if (committedResponse == null) {
            committedResponse = _jsonResponse(_redemptionPayload(), 201);
            throw DioException(
              requestOptions: options,
              type: DioExceptionType.receiveTimeout,
            );
          }
          return committedResponse!;
        });
        final container = _container(adapter, user: _user('account-a'));
        addTearDown(container.dispose);
        final request = _redemptionRequest(container, 'lvl1-privacy-basics');
        final provider = redeemRewardProvider(request);
        final subscription = container.listen(provider, (_, _) {});

        await expectLater(
          container.read(provider.future),
          throwsA(
            isA<DioException>().having(
              (error) => error.type,
              'type',
              DioExceptionType.receiveTimeout,
            ),
          ),
        );
        expect(attempts, hasLength(1));
        expect(committedResponse, isNotNull);

        container.invalidate(provider);
        final redemption = await container.read(provider.future);

        expect(redemption.status, 'redeemed');
        expect(attempts, hasLength(2));
        expect(
          attempts.map((options) => options.headers['Idempotency-Key']),
          everyElement(request.idempotencyKey),
        );
        expect(
          attempts.map((options) => options.headers['Authorization']),
          everyElement('Bearer session-account-a'),
        );
        subscription.close();
      },
    );
  });
}

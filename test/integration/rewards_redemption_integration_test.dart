import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../support/monthly_rewards_fixture.dart';

final _testSession = StateProvider<User?>((ref) => null);

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _RewardsAdapter implements HttpClientAdapter {
  _RewardsAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWith(_RewardsAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}

ResponseBody _redemptionResponse() => ResponseBody.fromString(
  jsonEncode({
    'id': 'red-1',
    'rewardId': 'lvl1-privacy-basics',
    'rewardLevel': 1,
    'rewardTitle': 'Privacy Starter Pack',
    'redeemedAt': '2026-05-27T00:00:00.000Z',
    'status': 'redeemed',
  }),
  201,
  headers: {
    Headers.contentTypeHeader: <String>[Headers.jsonContentType],
  },
);

ResponseBody _snapshotResponse({required bool redeemed}) =>
    ResponseBody.fromString(
      jsonEncode({
        'subscriptionTier': 'premium',
        'reputationLevel': 3,
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
            'description': 'Starter tools',
            'partnerName': 'Partner A',
            'locked': false,
            'redeemed': redeemed,
          },
        ],
        'redemptionHistory': <Map<String, dynamic>>[],
        'affiliateDisclosure':
            'Some reward links may include affiliate relationships.',
      }),
      200,
      headers: {
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );

// ---------------------------------------------------------------------------
// Shared snapshot factory helpers
// ---------------------------------------------------------------------------

RewardsSnapshot _snapshot({
  required bool redeemed,
  required List<RewardRedemption> history,
}) {
  return RewardsSnapshot(
    subscriptionTier: 'premium',
    reputationLevel: 3,
    reputationBand: 'established',
    availableRewardLevels: const [1, 2, 3, 4, 5],
    maxOptionsPerLevel: 1,
    redemptionStatus: 'active',
    fraudRiskStatus: 'normal',
    offers: [
      RewardOffer(
        id: 'lvl1-privacy-basics',
        rewardLevel: 1,
        title: 'Privacy Starter Pack',
        description: 'Starter tools',
        partnerName: 'Partner A',
        locked: false,
        redeemed: redeemed,
      ),
    ],
    redemptionHistory: history,
    affiliateDisclosure:
        'Some reward links may include affiliate relationships.',
  );
}

/// Snapshot with a single offer that is explicitly locked (e.g. wrong tier).
RewardsSnapshot _lockedOfferSnapshot({String lockReason = 'Tier limitation'}) {
  return RewardsSnapshot(
    subscriptionTier: 'free',
    reputationLevel: 1,
    reputationBand: 'verified',
    availableRewardLevels: const [1],
    maxOptionsPerLevel: 1,
    redemptionStatus: 'active',
    fraudRiskStatus: 'normal',
    offers: [
      RewardOffer(
        id: 'lvl3-research-tools',
        rewardLevel: 3,
        title: 'Research Tools Bundle',
        description: 'Advanced research suite',
        partnerName: 'Partner B',
        locked: true,
        redeemed: false,
        lockReason: lockReason,
      ),
    ],
    redemptionHistory: const [],
    affiliateDisclosure:
        'Some reward links may include affiliate relationships.',
  );
}

/// Snapshot where the only offer is already redeemed.
RewardsSnapshot _alreadyRedeemedSnapshot() {
  return RewardsSnapshot(
    subscriptionTier: 'premium',
    reputationLevel: 3,
    reputationBand: 'established',
    availableRewardLevels: const [1, 2, 3, 4, 5],
    maxOptionsPerLevel: 1,
    redemptionStatus: 'active',
    fraudRiskStatus: 'normal',
    offers: [
      const RewardOffer(
        id: 'lvl1-privacy-basics',
        rewardLevel: 1,
        title: 'Privacy Starter Pack',
        description: 'Starter tools',
        partnerName: 'Partner A',
        locked: false,
        redeemed: true,
      ),
    ],
    redemptionHistory: [
      RewardRedemption(
        id: 'red-existing',
        rewardId: 'lvl1-privacy-basics',
        rewardLevel: 1,
        rewardTitle: 'Privacy Starter Pack',
        redeemedAt: DateTime(2026, 5, 26),
        status: 'redeemed',
      ),
    ],
    affiliateDisclosure:
        'Some reward links may include affiliate relationships.',
  );
}

/// Snapshot for a restricted account where every offer is locked due to
/// fraud/safety checks.
RewardsSnapshot _restrictedAccountSnapshot() {
  return const RewardsSnapshot(
    subscriptionTier: 'premium',
    reputationLevel: 2,
    reputationBand: 'trusted',
    availableRewardLevels: [1, 2, 3, 4, 5],
    maxOptionsPerLevel: 1,
    redemptionStatus: 'restricted',
    fraudRiskStatus: 'elevated',
    offers: [
      RewardOffer(
        id: 'lvl1-privacy-basics',
        rewardLevel: 1,
        title: 'Privacy Starter Pack',
        description: 'Starter tools',
        partnerName: 'Partner A',
        locked: true,
        redeemed: false,
        lockReason:
            'Redemption is temporarily restricted while account safety checks complete.',
      ),
    ],
    redemptionHistory: [],
    affiliateDisclosure:
        'Some reward links may include affiliate relationships.',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  Future<void> scrollToVisible(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(
      target,
      320,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  testWidgets('Rewards redemption flow updates dashboard after redeem', (
    tester,
  ) async {
    var fetchCount = 0;
    var redemptionCalls = 0;
    var currentSnapshot = _snapshot(redeemed: false, history: const []);
    final pendingRedemption = Completer<RewardRedemption>();
    final redemption = RewardRedemption(
      id: 'red-1',
      rewardId: 'lvl1-privacy-basics',
      rewardLevel: 1,
      rewardTitle: 'Privacy Starter Pack',
      redeemedAt: DateTime(2026, 5, 27),
      status: 'redeemed',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...monthlyFixtureOverrides(),
          rewardsSnapshotProvider.overrideWith((ref, _) async {
            fetchCount++;
            return currentSnapshot;
          }),
          redeemRewardProvider.overrideWith((ref, request) {
            redemptionCalls++;
            return pendingRedemption.future;
          }),
        ],
        child: const MaterialApp(home: RewardsDashboardScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Lythaus Rewards'), findsOneWidget);
    await scrollToVisible(tester, find.text('Redeem'));
    expect(find.text('Redeem'), findsOneWidget);

    await tester.tap(find.text('Redeem'));
    await tester.pump();
    expect(find.text('Redeeming...'), findsOneWidget);
    await tester.tap(find.text('Redeeming...'));
    expect(redemptionCalls, 1);
    currentSnapshot = _snapshot(redeemed: true, history: [redemption]);
    pendingRedemption.complete(redemption);
    await tester.pumpAndSettle();

    expect(redemptionCalls, 1);
    expect(fetchCount, greaterThan(1));
    expect(find.text('Reward redeemed successfully.'), findsOneWidget);
    expect(find.text('Redeemed'), findsOneWidget);
    expect(find.text('Redeem'), findsNothing);

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();

    expect(find.text('Redemption history'), findsOneWidget);
    expect(find.text('Privacy Starter Pack'), findsWidgets);
  });

  testWidgets('real redemption stays alive until session change cancels it', (
    tester,
  ) async {
    final delayedResponse = Completer<ResponseBody>();
    final requestStarted = Completer<void>();
    final adapter = _RewardsAdapter((request) {
      requestStarted.complete();
      return delayedResponse.future;
    });
    final dio = _dioWith(adapter);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          _testSession.overrideWith((ref) => _user('account-a')),
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(ref.read(_testSession.notifier)),
          ),
          currentUserProvider.overrideWith((ref) => ref.watch(_testSession)),
          jwtProvider.overrideWith((ref) async {
            final user = ref.watch(currentUserProvider);
            return user == null ? null : 'session-${user.id}';
          }),
          secureDioProvider.overrideWithValue(dio),
          monthlyRewardsViewProvider.overrideWith((ref) async {
            throw StateError('monthly fixture unavailable');
          }),
          monthlyReputationReportProvider.overrideWith((ref, _) async {
            throw StateError('report fixture unavailable');
          }),
          rewardsSnapshotProvider.overrideWith(
            (ref, _) async => _snapshot(redeemed: false, history: const []),
          ),
        ],
        child: const MaterialApp(home: RewardsDashboardScreen()),
      ),
    );

    await tester.pumpAndSettle();
    await scrollToVisible(tester, find.text('Redeem'));
    final container = ProviderScope.containerOf(
      tester.element(find.byType(RewardsDashboardScreen)),
    );
    expect(container.read(currentUserProvider)?.id, 'account-a');
    expect(container.read(secureDioProvider), same(dio));
    expect(dio.httpClientAdapter, same(adapter));
    await container.read(jwtProvider.future);
    await tester.tap(find.text('Redeem'));
    await tester.pump();
    expect(find.text('Redeeming...'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.runAsync(
      () => requestStarted.future.timeout(const Duration(seconds: 1)),
    );
    expect(find.text('Redeeming...'), findsOneWidget);

    expect(adapter.requests, hasLength(1));
    final request = adapter.requests.single;
    final cancelToken = request.cancelToken!;
    expect(
      cancelToken.isCancelled,
      isFalse,
      reason: 'the dashboard is awaiting this real provider request',
    );

    container.read(_testSession.notifier).state = null;
    expect(cancelToken.isCancelled, isTrue);
    delayedResponse.complete(_redemptionResponse());
    await tester.pumpAndSettle();

    expect(find.text('Reward redeemed successfully.'), findsNothing);
    expect(find.text('Unable to redeem this reward right now.'), findsNothing);
  });

  testWidgets(
    'lost response refreshes rewards and scopes manual retry keys to accounts',
    (tester) async {
      final loseFirstResponse = Completer<void>();
      final requestStarted = Completer<void>();
      final committedAccounts = <String>{};
      final redemptionRequests = <RequestOptions>[];
      final adapter = _RewardsAdapter((request) async {
        final authorization = request.headers['Authorization'] as String;
        if (request.method == 'GET' && request.path == '/rewards/me') {
          return _snapshotResponse(
            redeemed: committedAccounts.contains(authorization),
          );
        }
        if (request.method == 'POST') {
          redemptionRequests.add(request);
          if (redemptionRequests.length == 1) {
            requestStarted.complete();
            await loseFirstResponse.future;
            throw DioException(
              requestOptions: request,
              type: DioExceptionType.receiveTimeout,
            );
          }
          committedAccounts.add(authorization);
          return _redemptionResponse();
        }
        throw StateError('Unexpected rewards request: ${request.method}');
      });
      final dio = _dioWith(adapter);
      dio.interceptors.add(IdempotencyRetryInterceptor(dio));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            _testSession.overrideWith((ref) => _user('account-a')),
            authSessionRevisionProvider.overrideWith(
              (ref) => AuthSessionRevision(ref.read(_testSession.notifier)),
            ),
            currentUserProvider.overrideWith((ref) => ref.watch(_testSession)),
            jwtProvider.overrideWith((ref) async {
              final user = ref.watch(currentUserProvider);
              return user == null ? null : 'session-${user.id}';
            }),
            secureDioProvider.overrideWithValue(dio),
            monthlyRewardsViewProvider.overrideWith((ref) async {
              throw StateError('monthly fixture unavailable');
            }),
            monthlyReputationReportProvider.overrideWith((ref, _) async {
              throw StateError('report fixture unavailable');
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );

      await tester.pumpAndSettle();
      await scrollToVisible(tester, find.text('Redeem'));
      final container = ProviderScope.containerOf(
        tester.element(find.byType(RewardsDashboardScreen)),
      );
      await tester.tap(find.text('Redeem'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1));
      await tester.runAsync(
        () => requestStarted.future.timeout(const Duration(seconds: 1)),
      );

      expect(find.text('Redeeming...'), findsOneWidget);
      expect(redemptionRequests, hasLength(1));
      final accountAKey = redemptionRequests.single.headers['Idempotency-Key'];
      expect(
        redemptionRequests.single.headers['Authorization'],
        'Bearer session-account-a',
      );

      loseFirstResponse.complete();
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpAndSettle();

      expect(redemptionRequests, hasLength(1));
      expect(
        find.text(
          'We could not confirm this redemption. Your rewards are refreshing; retrying will reuse this request.',
        ),
        findsOneWidget,
      );
      expect(find.text('Reward redeemed successfully.'), findsNothing);
      expect(find.text('Redeem'), findsOneWidget);
      expect(
        adapter.requests.where(
          (request) => request.method == 'GET' && request.path == '/rewards/me',
        ),
        hasLength(2),
        reason: 'the timeout must refresh the current account snapshot',
      );

      await tester.tap(find.text('Redeem'));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(redemptionRequests, hasLength(2));
      expect(redemptionRequests[1].headers['Idempotency-Key'], accountAKey);
      expect(
        redemptionRequests[1].headers['Authorization'],
        'Bearer session-account-a',
      );
      expect(find.text('Redeemed'), findsOneWidget);
      expect(find.text('Redeem'), findsNothing);

      container.read(_testSession.notifier).state = _user('account-b');
      await tester.pumpAndSettle();
      await scrollToVisible(tester, find.text('Redeem'));

      expect(container.read(currentUserProvider)?.id, 'account-b');
      expect(container.read(authSessionRevisionProvider), 1);
      expect(find.text('Redeemed'), findsNothing);
      expect(find.text('Redeem'), findsOneWidget);
      await tester.tap(find.text('Redeem'));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(redemptionRequests, hasLength(3));
      expect(
        redemptionRequests[2].headers['Authorization'],
        'Bearer session-account-b',
      );
      expect(
        redemptionRequests[2].headers['Idempotency-Key'],
        isNot(accountAKey),
      );
      expect(find.text('Redeemed'), findsOneWidget);
      expect(find.text('Redeem'), findsNothing);
    },
  );

  // -------------------------------------------------------------------------
  // Negative scenarios — Phase 3.2
  // -------------------------------------------------------------------------

  group('negative redemption scenarios', () {
    // -----------------------------------------------------------------------
    // 1. Locked reward — wrong tier
    //    The offer's locked flag is true from the backend. The dashboard must
    //    render a Locked chip and NO Redeem button; no provider call should
    //    be made.
    // -----------------------------------------------------------------------
    testWidgets('locked reward shows Locked chip and omits Redeem button', (
      tester,
    ) async {
      var redemptionCalls = 0;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...monthlyFixtureOverrides(),
            rewardsSnapshotProvider.overrideWith(
              (_, _) async => _lockedOfferSnapshot(),
            ),
            redeemRewardProvider.overrideWith((ref, request) async {
              redemptionCalls++;
              throw StateError('Should not be called for a locked offer');
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );

      await tester.pumpAndSettle();

      await scrollToVisible(
        tester,
        find.textContaining('Research Tools Bundle'),
      );
      expect(find.textContaining('Research Tools Bundle'), findsOneWidget);
      expect(find.text('Locked'), findsOneWidget);
      expect(find.text('Tier limitation'), findsOneWidget);
      expect(find.text('Redeem'), findsNothing);
      expect(redemptionCalls, 0);
    });

    // -----------------------------------------------------------------------
    // 2. Already-redeemed reward
    //    The backend sets redeemed: true. The dashboard shows the Redeemed
    //    chip instead of a Redeem button; tapping elsewhere must not call the
    //    provider.
    // -----------------------------------------------------------------------
    testWidgets(
      'already-redeemed offer shows Redeemed chip and no Redeem button',
      (tester) async {
        var redemptionCalls = 0;

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...monthlyFixtureOverrides(),
              rewardsSnapshotProvider.overrideWith(
                (_, _) async => _alreadyRedeemedSnapshot(),
              ),
              redeemRewardProvider.overrideWith((ref, request) async {
                redemptionCalls++;
                throw StateError('Should not be called for a redeemed offer');
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();

        await scrollToVisible(tester, find.text('Privacy Starter Pack'));
        expect(find.text('Privacy Starter Pack'), findsOneWidget);
        expect(find.text('Redeemed'), findsOneWidget);
        expect(find.text('Redeem'), findsNothing);
        expect(redemptionCalls, 0);
      },
    );

    // -----------------------------------------------------------------------
    // 3. Restricted account
    //    fraudRiskStatus is elevated / redemptionStatus is restricted. The
    //    backend returns all offers as locked with a restriction message. The
    //    dashboard must show only Locked chips with the restriction reason, no
    //    Redeem buttons anywhere.
    // -----------------------------------------------------------------------
    testWidgets(
      'restricted account shows all offers locked with restriction reason',
      (tester) async {
        var redemptionCalls = 0;

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...monthlyFixtureOverrides(),
              rewardsSnapshotProvider.overrideWith(
                (_, _) async => _restrictedAccountSnapshot(),
              ),
              redeemRewardProvider.overrideWith((ref, request) async {
                redemptionCalls++;
                throw StateError(
                  'Should not be called for a restricted account',
                );
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();

        await scrollToVisible(
          tester,
          find.text('Redemption status: restricted'),
        );
        expect(find.text('Redemption status: restricted'), findsOneWidget);
        await scrollToVisible(
          tester,
          find.text(
            'Redemption is temporarily restricted while account safety checks complete.',
          ),
        );
        expect(find.text('Locked'), findsOneWidget);
        expect(
          find.text(
            'Redemption is temporarily restricted while account safety checks complete.',
          ),
          findsOneWidget,
        );
        expect(find.text('Redeem'), findsNothing);
        expect(redemptionCalls, 0);
      },
    );

    // -----------------------------------------------------------------------
    // 4. API error on redeem attempt
    //    The offer appears unlocked, but the server returns an error. The
    //    dashboard must show the error snackbar, must NOT invalidate/refresh
    //    the snapshot, and must re-enable the Redeem button (remove the
    //    loading state).
    // -----------------------------------------------------------------------
    testWidgets(
      'API error during redeem shows error snackbar and does not refresh snapshot',
      (tester) async {
        var fetchCount = 0;
        var redemptionCalls = 0;

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...monthlyFixtureOverrides(),
              rewardsSnapshotProvider.overrideWith((ref, _) async {
                fetchCount++;
                return _snapshot(redeemed: false, history: const []);
              }),
              redeemRewardProvider.overrideWith((ref, request) async {
                redemptionCalls++;
                final options = RequestOptions(
                  path: '/rewards/${request.rewardId}/redeem',
                );
                throw DioException(
                  requestOptions: options,
                  response: Response<dynamic>(
                    requestOptions: options,
                    statusCode: 400,
                    data: {'error': 'reward_locked'},
                  ),
                );
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();
        await scrollToVisible(tester, find.text('Redeem'));
        final fetchCountBeforeTap = fetchCount;

        expect(find.text('Redeem'), findsOneWidget);

        await tester.tap(find.text('Redeem'));
        await tester.pump();
        await tester.pumpAndSettle();

        expect(redemptionCalls, 1);
        // Snapshot must NOT be refreshed on failure
        expect(fetchCount, fetchCountBeforeTap);
        expect(
          find.text('Unable to redeem this reward right now.'),
          findsOneWidget,
        );
        // Success snackbar must be absent
        expect(find.text('Reward redeemed successfully.'), findsNothing);
        // Redeem button is re-enabled after the finally block
        expect(find.text('Redeem'), findsOneWidget);
      },
    );

    testWidgets(
      'uncertain idempotency outcome refreshes rewards and reuses its key',
      (tester) async {
        var fetchCount = 0;
        final redemptionRequests = <RewardRedemptionRequest>[];

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...monthlyFixtureOverrides(),
              rewardsSnapshotProvider.overrideWith((ref, _) async {
                fetchCount++;
                return _snapshot(redeemed: false, history: const []);
              }),
              redeemRewardProvider.overrideWith((ref, request) async {
                redemptionRequests.add(request);
                final options = RequestOptions(
                  path: '/rewards/${request.rewardId}/redeem',
                );
                throw DioException(
                  requestOptions: options,
                  response: Response<dynamic>(
                    requestOptions: options,
                    statusCode: 409,
                    data: {'error': 'idempotency_outcome_unknown'},
                  ),
                );
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();
        await scrollToVisible(tester, find.text('Redeem'));
        final fetchCountBeforeRedeem = fetchCount;

        await tester.tap(find.text('Redeem'));
        await tester.pump();
        await tester.pumpAndSettle();

        expect(fetchCount, greaterThan(fetchCountBeforeRedeem));
        expect(
          find.text(
            'We could not confirm this redemption. Your rewards are refreshing; retrying will reuse this request.',
          ),
          findsOneWidget,
        );
        expect(find.text('Redeem'), findsOneWidget);

        await tester.tap(find.text('Redeem'));
        await tester.pump();
        await tester.pumpAndSettle();

        expect(redemptionRequests, hasLength(2));
        expect(
          redemptionRequests.last.idempotencyKey,
          redemptionRequests.first.idempotencyKey,
        );
      },
    );

    testWidgets('already redeemed response refreshes the dashboard state', (
      tester,
    ) async {
      var fetchCount = 0;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...monthlyFixtureOverrides(),
            rewardsSnapshotProvider.overrideWith((ref, _) async {
              fetchCount++;
              return _snapshot(redeemed: fetchCount > 1, history: const []);
            }),
            redeemRewardProvider.overrideWith((ref, request) async {
              final options = RequestOptions(
                path: '/rewards/${request.rewardId}/redeem',
              );
              throw DioException(
                requestOptions: options,
                response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: 409,
                  data: {'error': 'reward_already_redeemed'},
                ),
              );
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );

      await tester.pumpAndSettle();
      await scrollToVisible(tester, find.text('Redeem'));

      await tester.tap(find.text('Redeem'));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(fetchCount, greaterThan(1));
      expect(
        find.text(
          'This reward was already redeemed. Your rewards have been refreshed.',
        ),
        findsOneWidget,
      );
      expect(find.text('Redeemed'), findsOneWidget);
      expect(find.text('Redeem'), findsNothing);
    });
  });
}

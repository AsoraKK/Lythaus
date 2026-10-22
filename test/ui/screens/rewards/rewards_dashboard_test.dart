import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';

void main() {
  final snapshot = RewardsSnapshot(
    subscriptionTier: 'premium',
    reputationLevel: 3,
    reputationBand: 'established',
    availableRewardLevels: [1, 2, 3, 4, 5],
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
        redeemed: false,
      ),
      const RewardOffer(
        id: 'lvl4-editorial-tools',
        rewardLevel: 4,
        title: 'Editorial Tools Bundle',
        description: 'Advanced tools',
        partnerName: 'Partner B',
        locked: true,
        redeemed: false,
        lockReason: 'Tier limitation',
      ),
    ],
    redemptionHistory: [
      RewardRedemption(
        id: 'red-1',
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

  Widget buildDashboard({required AsyncValue<RewardsSnapshot> rewardsValue}) {
    return ProviderScope(
      overrides: [
        rewardsSnapshotProvider.overrideWith(
          (ref, _) => rewardsValue.when(
            data: (d) => Future.value(d),
            loading: () => Future.delayed(const Duration(days: 1)),
            error: (e, s) => Future.error(e, s),
          ),
        ),
      ],
      child: const MaterialApp(home: RewardsDashboardScreen()),
    );
  }

  Future<void> scrollUntilText(WidgetTester tester, String text) async {
    await tester.scrollUntilVisible(
      find.text(text),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
  }

  group('RewardsDashboardScreen', () {
    testWidgets('shows app bar title and status header', (tester) async {
      await tester.pumpWidget(
        buildDashboard(rewardsValue: AsyncValue.data(snapshot)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Lythaus Rewards'), findsOneWidget);
      expect(find.text('Your rewards status'), findsOneWidget);
      expect(find.text('Subscription tier: premium'), findsOneWidget);
    });

    testWidgets('shows error state with retry button', (tester) async {
      await tester.pumpWidget(
        buildDashboard(
          rewardsValue: AsyncValue.error(
            Exception('Network error'),
            StackTrace.current,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Rewards could not be loaded'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('retry shows progress and a repeated failure stays an error', (
      tester,
    ) async {
      final retry = Completer<RewardsSnapshot>();
      var calls = 0;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            rewardsSnapshotProvider.overrideWith((ref, _) {
              calls++;
              if (calls == 1) return Future.error(StateError('synthetic'));
              return retry.future;
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(calls, 2);
      expect(find.text('Loading your rewards…'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
      retry.completeError(StateError('synthetic repeat failure'));
      await tester.pumpAndSettle();
      expect(find.text('Rewards could not be loaded'), findsOneWidget);
      expect(find.text('Your rewards status'), findsNothing);
      expect(
        find.text('No reward offers are currently available.'),
        findsNothing,
      );
      expect(find.text('Redeem'), findsNothing);
    });

    testWidgets('retry recovers only when the server returns rewards', (
      tester,
    ) async {
      var calls = 0;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            rewardsSnapshotProvider.overrideWith((ref, _) async {
              if (++calls == 1) throw StateError('synthetic');
              return snapshot;
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.text('Your rewards status'), findsOneWidget);
      expect(find.text('Rewards could not be loaded'), findsNothing);
    });

    testWidgets(
      'connection failure remains readable at narrow width and large text',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 640));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              rewardsSnapshotProvider.overrideWith(
                (ref, _) async => throw DioException(
                  requestOptions: RequestOptions(path: '/rewards/me'),
                  type: DioExceptionType.connectionError,
                ),
              ),
            ],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(2)),
                child: child!,
              ),
              home: const RewardsDashboardScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.textContaining('The connection to Rewards failed.'),
          findsOneWidget,
        );
        await tester.ensureVisible(find.text('Retry'));
        expect(find.text('Retry').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    for (final status in [403, 503]) {
      testWidgets('HTTP $status is explained without exposing server details', (
        tester,
      ) async {
        final request = RequestOptions(path: '/rewards/me');
        await tester.pumpWidget(
          buildDashboard(
            rewardsValue: AsyncValue.error(
              DioException(
                requestOptions: request,
                response: Response(
                  requestOptions: request,
                  statusCode: status,
                  data: {'error': 'private internal diagnostic'},
                ),
                type: DioExceptionType.badResponse,
              ),
              StackTrace.current,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.textContaining(
            status == 403
                ? 'Access to your rewards could not be verified.'
                : 'The Rewards service could not complete the request.',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('private internal diagnostic'),
          findsNothing,
        );
      });
    }

    testWidgets('shows XP and tier data when loaded', (tester) async {
      await tester.pumpWidget(
        buildDashboard(rewardsValue: AsyncValue.data(snapshot)),
      );
      await tester.pumpAndSettle();
      await scrollUntilText(tester, 'Available rewards');

      expect(find.text('Available rewards'), findsOneWidget);
      expect(find.text('Privacy Starter Pack'), findsOneWidget);
      expect(find.text('Partner: Partner A'), findsOneWidget);
      expect(find.text('Redeem'), findsOneWidget);
    });

    testWidgets('shows redemption history section', (tester) async {
      await tester.pumpWidget(
        buildDashboard(rewardsValue: AsyncValue.data(snapshot)),
      );
      await tester.pumpAndSettle();
      await scrollUntilText(tester, 'Redemption history');

      expect(find.text('Redemption history'), findsOneWidget);
      expect(find.text('Privacy Starter Pack'), findsWidgets);
    });

    testWidgets('shows locked reward state', (tester) async {
      await tester.pumpWidget(
        buildDashboard(rewardsValue: AsyncValue.data(snapshot)),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -800));
      await tester.pumpAndSettle();

      expect(find.textContaining('Editorial Tools Bundle'), findsOneWidget);
      expect(find.text('Locked'), findsOneWidget);
      expect(find.text('Tier limitation'), findsOneWidget);
    });

    testWidgets('shows affiliate disclosure', (tester) async {
      await tester.pumpWidget(
        buildDashboard(rewardsValue: AsyncValue.data(snapshot)),
      );
      await tester.pumpAndSettle();
      await scrollUntilText(
        tester,
        'Some reward links may include affiliate relationships.',
      );

      expect(
        find.text('Some reward links may include affiliate relationships.'),
        findsOneWidget,
      );
    });
  });
}

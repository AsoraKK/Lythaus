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
          (ref) => rewardsValue.when(
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

      expect(find.text('Unable to load rewards right now.'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

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

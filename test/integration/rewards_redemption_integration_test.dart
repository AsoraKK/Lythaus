import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  testWidgets('Rewards redemption flow updates dashboard after redeem', (
    tester,
  ) async {
    var fetchCount = 0;
    var redemptionCalls = 0;
    var currentSnapshot = _snapshot(redeemed: false, history: const []);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          rewardsSnapshotProvider.overrideWith((ref) async {
            fetchCount++;
            return currentSnapshot;
          }),
          redeemRewardProvider.overrideWith((ref, rewardId) async {
            redemptionCalls++;
            final redemption = RewardRedemption(
              id: 'red-1',
              rewardId: rewardId,
              rewardLevel: 1,
              rewardTitle: 'Privacy Starter Pack',
              redeemedAt: DateTime(2026, 5, 27),
              status: 'redeemed',
            );
            currentSnapshot = _snapshot(redeemed: true, history: [redemption]);
            return redemption;
          }),
        ],
        child: const MaterialApp(home: RewardsDashboardScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Lythaus Rewards'), findsOneWidget);
    expect(find.text('Redeem'), findsOneWidget);

    await tester.tap(find.text('Redeem'));
    await tester.pump();
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
            rewardsSnapshotProvider.overrideWith(
              (_) async => _lockedOfferSnapshot(),
            ),
            redeemRewardProvider.overrideWith((ref, rewardId) async {
              redemptionCalls++;
              throw StateError('Should not be called for a locked offer');
            }),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );

      await tester.pumpAndSettle();

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
              rewardsSnapshotProvider.overrideWith(
                (_) async => _alreadyRedeemedSnapshot(),
              ),
              redeemRewardProvider.overrideWith((ref, rewardId) async {
                redemptionCalls++;
                throw StateError('Should not be called for a redeemed offer');
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();

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
              rewardsSnapshotProvider.overrideWith(
                (_) async => _restrictedAccountSnapshot(),
              ),
              redeemRewardProvider.overrideWith((ref, rewardId) async {
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

        expect(find.text('Redemption status: restricted'), findsOneWidget);
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
              rewardsSnapshotProvider.overrideWith((ref) async {
                fetchCount++;
                return _snapshot(redeemed: false, history: const []);
              }),
              redeemRewardProvider.overrideWith((ref, rewardId) async {
                redemptionCalls++;
                throw Exception('Internal server error');
              }),
            ],
            child: const MaterialApp(home: RewardsDashboardScreen()),
          ),
        );

        await tester.pumpAndSettle();
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
  });
}

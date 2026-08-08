// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class RewardsDashboardScreen extends ConsumerStatefulWidget {
  const RewardsDashboardScreen({super.key});

  @override
  ConsumerState<RewardsDashboardScreen> createState() =>
      _RewardsDashboardScreenState();
}

class _RewardsDashboardScreenState
    extends ConsumerState<RewardsDashboardScreen> {
  final Set<String> _redeemingIds = <String>{};

  Future<void> _redeem(String rewardId) async {
    if (_redeemingIds.contains(rewardId)) return;
    setState(() => _redeemingIds.add(rewardId));

    try {
      await ref.read(redeemRewardProvider(rewardId).future);
      ref.invalidate(rewardsSnapshotProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reward redeemed successfully.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unable to redeem this reward right now.'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _redeemingIds.remove(rewardId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final rewardsAsync = ref.watch(rewardsSnapshotProvider);

    return rewardsAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Lythaus Rewards')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Scaffold(
        appBar: AppBar(title: const Text('Lythaus Rewards')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Unable to load rewards right now.'),
              const SizedBox(height: Spacing.sm),
              FilledButton(
                onPressed: () => ref.invalidate(rewardsSnapshotProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (snapshot) {
        return Scaffold(
          appBar: AppBar(title: const Text('Lythaus Rewards')),
          body: ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(Spacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Your rewards status',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: Spacing.sm),
                      Text('Subscription tier: ${snapshot.subscriptionTier}'),
                      Text('Reputation level: ${snapshot.reputationLevel}'),
                      Text('Reputation band: ${snapshot.reputationBand}'),
                      Text('Redemption status: ${snapshot.redemptionStatus}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              Text(
                'Available rewards',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: Spacing.sm),
              ...snapshot.offers.map(
                (offer) => _RewardCard(
                  offer: offer,
                  isRedeeming: _redeemingIds.contains(offer.id),
                  onRedeem: () => _redeem(offer.id),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              Text(
                'Redemption history',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: Spacing.sm),
              if (snapshot.redemptionHistory.isEmpty)
                const Text('No rewards redeemed yet.')
              else
                ...snapshot.redemptionHistory.map(
                  (item) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.rewardTitle),
                    subtitle: Text(
                      'Level ${item.rewardLevel} · ${item.redeemedAt.toLocal().toIso8601String().split('T').first}',
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              Text(
                snapshot.affiliateDisclosure,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _RewardCard extends StatelessWidget {
  const _RewardCard({
    required this.offer,
    required this.isRedeeming,
    required this.onRedeem,
  });

  final RewardOffer offer;
  final bool isRedeeming;
  final VoidCallback onRedeem;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Level ${offer.rewardLevel} · ${offer.title}',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: Spacing.xs),
            Text(offer.description),
            const SizedBox(height: Spacing.xs),
            Text(
              'Partner: ${offer.partnerName}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: Spacing.sm),
            if (offer.redeemed)
              const Chip(label: Text('Redeemed'))
            else if (offer.locked)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Chip(label: Text('Locked')),
                  if (offer.lockReason != null)
                    Padding(
                      padding: const EdgeInsets.only(top: Spacing.xs),
                      child: Text(
                        offer.lockReason!,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                ],
              )
            else
              FilledButton(
                onPressed: isRedeeming ? null : onRedeem,
                child: Text(isRedeeming ? 'Redeeming...' : 'Redeem'),
              ),
          ],
        ),
      ),
    );
  }
}

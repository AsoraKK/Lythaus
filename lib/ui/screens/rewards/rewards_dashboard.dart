// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/screens/rewards/monthly_reputation_widgets.dart';
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
  final _redemptionKeys = <({String rewardId, int sessionRevision}), String>{};

  String _loadFailureMessage(Object error) {
    if (error is DioException) {
      if (error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.receiveTimeout ||
          error.type == DioExceptionType.sendTimeout) {
        return 'The connection to Rewards failed. Check your connection and try again.';
      }
      final status = error.response?.statusCode;
      if (status == 401 || status == 403) {
        return 'Access to your rewards could not be verified. Try again. If this continues, sign in again.';
      }
      if (status != null && status >= 500) {
        return 'The Rewards service could not complete the request. Try again later.';
      }
    }
    return 'Your rewards details could not be retrieved. Try again, or return later if the problem continues.';
  }

  void _clearRedemptionKeysForSession(int sessionRevision) {
    _redemptionKeys.removeWhere(
      (scope, _) => scope.sessionRevision != sessionRevision,
    );
  }

  String? _redemptionErrorCode(Object error) {
    if (error is! DioException || error.response?.data is! Map) return null;
    final code = (error.response!.data as Map)['error'];
    return code is String ? code : null;
  }

  bool _redemptionOutcomeUncertain(Object error, String? errorCode) {
    if (errorCode == 'idempotency_outcome_unknown' ||
        errorCode == 'idempotency_in_progress') {
      return true;
    }
    if (error is DioException) {
      final statusCode = error.response?.statusCode;
      return statusCode == null || statusCode >= 500;
    }
    return true;
  }

  Future<void> _redeem(String rewardId) async {
    if (_redeemingIds.contains(rewardId)) return;
    final sessionRevision = ref.read(authSessionRevisionProvider);
    _clearRedemptionKeysForSession(sessionRevision);
    final keyScope = (rewardId: rewardId, sessionRevision: sessionRevision);
    final idempotencyKey = _redemptionKeys.putIfAbsent(
      keyScope,
      () => IdempotencyKey.create('reward.redeem'),
    );
    final redemptionRequest = (
      rewardId: rewardId,
      sessionRevision: sessionRevision,
      idempotencyKey: idempotencyKey,
    );
    final redemptionProvider = redeemRewardProvider(redemptionRequest);
    setState(() => _redeemingIds.add(rewardId));
    ref.invalidate(redemptionProvider);
    final redemptionSubscription = ref.listenManual(
      redemptionProvider,
      (_, _) {},
    );

    try {
      final redemption = await ref.read(redemptionProvider.future);
      if (!mounted ||
          ref.read(authSessionRevisionProvider) != sessionRevision) {
        return;
      }
      _redemptionKeys.remove(keyScope);
      ref.invalidate(rewardsSnapshotProvider(sessionRevision));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            redemption.status == 'redeemed'
                ? 'Reward redeemed successfully.'
                : 'Request received. Check redemption history for its status.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted ||
          ref.read(authSessionRevisionProvider) != sessionRevision) {
        return;
      }
      final errorCode = _redemptionErrorCode(error);
      final outcomeUncertain = _redemptionOutcomeUncertain(error, errorCode);
      if (!outcomeUncertain) {
        _redemptionKeys.remove(keyScope);
      }
      if (outcomeUncertain || errorCode == 'reward_already_redeemed') {
        ref.invalidate(rewardsSnapshotProvider(sessionRevision));
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            errorCode == 'reward_already_redeemed'
                ? 'This reward was already redeemed. Your rewards have been refreshed.'
                : outcomeUncertain
                ? 'We could not confirm this redemption. Your rewards are refreshing; retrying will reuse this request.'
                : 'Unable to redeem this reward right now.',
          ),
        ),
      );
    } finally {
      redemptionSubscription.close();
      if (mounted) {
        setState(() => _redeemingIds.remove(rewardId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionRevision = ref.watch(authSessionRevisionProvider);
    _clearRedemptionKeysForSession(sessionRevision);
    final rewardsAsync = ref.watch(rewardsSnapshotProvider(sessionRevision));

    return rewardsAsync.when(
      skipLoadingOnRefresh: !rewardsAsync.hasError,
      loading: () => ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Lythaus Rewards')),
          body: const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: Spacing.md),
                Text('Loading your rewards…'),
              ],
            ),
          ),
        ),
      ),
      error: (error, _) => ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Lythaus Rewards')),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 32),
                const SizedBox(height: Spacing.md),
                Text(
                  'Rewards could not be loaded',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: Spacing.sm),
                Text(_loadFailureMessage(error)),
                const SizedBox(height: Spacing.sm),
                const Text(
                  'Your reward availability and redemption history cannot be shown until this loads.',
                ),
                const SizedBox(height: Spacing.sm),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(rewardsSnapshotProvider(sessionRevision)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ),
      data: (snapshot) {
        return ReadingPane(
          child: Scaffold(
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
                        const SizedBox(height: Spacing.sm),
                        const Text(
                          'These are eligibility details. Reward points, authorship, account security and subscription access are separate.',
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Spacing.lg),
                const MonthlyReputationTrackerCard(),
                const SizedBox(height: Spacing.sm),
                const MonthlyReputationReportCard(),
                const SizedBox(height: Spacing.lg),
                Text(
                  'Available rewards',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: Spacing.sm),
                if (snapshot.offers.isEmpty)
                  const Text('No reward offers are currently available.'),
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
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
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
                        'Level ${item.rewardLevel} · ${DateFormat.yMMMd().format(item.redeemedAt.toLocal())} · ${item.status.replaceAll('_', ' ')}',
                      ),
                    ),
                  ),
                if (snapshot.affiliateDisclosure.isNotEmpty)
                  Text(
                    snapshot.affiliateDisclosure,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
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

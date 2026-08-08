// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/state/models/reputation.dart';

const List<SubscriptionEntitlementTier> _lythausSubscriptionEntitlementTiers = [
  SubscriptionEntitlementTier(
    id: 'free',
    name: 'Free',
    minXP: 0,
    privileges: [
      'Discovery + News Board preview',
      '1 custom feed with personalized filters',
      'Rewards capped through reputation level 3',
      'Limited daily posting',
    ],
  ),
  SubscriptionEntitlementTier(
    id: 'premium',
    name: 'Premium',
    minXP: 1200,
    privileges: [
      'Discovery + full News Board access',
      '2 custom feeds with personalized filters',
      '1 reward per reputation level',
      'Unrestricted normal posting',
    ],
  ),
  SubscriptionEntitlementTier(
    id: 'black',
    name: 'Black',
    minXP: 3200,
    privileges: [
      'Discovery + full News Board access',
      '3 custom feeds with personalized filters',
      'All eligible rewards unlocked',
      'Unrestricted normal posting',
    ],
  ),
];

final reputationProvider = FutureProvider<UserReputation>((ref) async {
  final user = ref.watch(currentUserProvider);
  final token = await ref.watch(jwtProvider.future);

  SubscriptionStatus? status;
  if (token != null && token.isNotEmpty) {
    try {
      status = await ref
          .read(subscriptionServiceProvider)
          .checkStatus(token: token);
    } catch (_) {
      status = null;
    }
  }

  final tierId = _resolveTierId(status?.tier, user);
  final tier = _lythausSubscriptionEntitlementTiers.firstWhere(
    (candidate) => candidate.id == tierId,
    orElse: () => _lythausSubscriptionEntitlementTiers.first,
  );

  final rawScore = user?.reputationScore ?? 0;
  final level = computeLevelFromScore(rawScore);

  return UserReputation(
    xp: rawScore,
    tier: tier,
    missions: _buildEntitlementMissions(status?.entitlements),
    recentAchievements: _buildRecentAchievements(status, tier),
    reputationLevel: level,
    reputationBand: levelDisplayName(level),
  );
});

final subscriptionEntitlementTiersProvider =
    Provider<List<SubscriptionEntitlementTier>>(
      (ref) => _lythausSubscriptionEntitlementTiers,
    );

@Deprecated('Use subscriptionEntitlementTiersProvider instead.')
final reputationTiersProvider = Provider<List<SubscriptionEntitlementTier>>(
  (ref) => _lythausSubscriptionEntitlementTiers,
);

/// Phase 1: Provides the numeric [ReputationLevel] for the current user.
/// Computed client-side from `reputationScore` using default thresholds.
final reputationLevelProvider = Provider<ReputationLevel>((ref) {
  final userAsync = ref.watch(currentUserProvider);
  final rawScore = userAsync?.reputationScore ?? 0;
  return computeLevelFromScore(rawScore);
});

/// Phase 1: Provides a paginated reputation ledger for the current user.
/// Returns `AsyncValue<List<LedgerEntry>>`.
final reputationLedgerProvider = FutureProvider<List<LedgerEntry>>((ref) async {
  final token = await ref.watch(jwtProvider.future);
  if (token == null || token.isEmpty) {
    return const [];
  }

  try {
    final dio = ref.read(secureDioProvider);
    final response = await dio.get<Map<String, dynamic>>(
      '/reputation/me/ledger',
      queryParameters: {'filter': 'all', 'limit': '20'},
    );

    final data = response.data;
    final entriesJson = data?['entries'] as List<dynamic>? ?? [];
    return entriesJson
        .map((e) => LedgerEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return const [];
  }
});

String _resolveTierId(String? subscriptionTier, User? user) {
  final normalized = (subscriptionTier ?? '').toLowerCase().trim();
  if (normalized == 'free' ||
      normalized == 'premium' ||
      normalized == 'black') {
    return normalized;
  }

  if (user == null) {
    return 'free';
  }

  // ignore: deprecated_member_use
  switch (user.tier) {
    // ignore: deprecated_member_use
    case UserTier.bronze:
      return 'free';
    // ignore: deprecated_member_use
    case UserTier.silver:
      return 'premium';
    // ignore: deprecated_member_use
    case UserTier.gold:
      return 'premium';
    // ignore: deprecated_member_use
    case UserTier.platinum:
      return 'black';
  }
}

List<Mission> _buildEntitlementMissions(
  SubscriptionEntitlements? entitlements,
) {
  if (entitlements == null) {
    return const [];
  }

  return [
    Mission(
      id: 'entitlement_daily_posts',
      title: 'Daily post limit: ${entitlements.dailyPosts}',
      xpReward: 0,
      completed: true,
    ),
    Mission(
      id: 'entitlement_media_per_post',
      title: 'Media attachments per post: ${entitlements.maxMediaPerPost}',
      xpReward: 0,
      completed: true,
    ),
    Mission(
      id: 'entitlement_media_size',
      title: 'Max media size: ${entitlements.maxMediaSizeMB} MB',
      xpReward: 0,
      completed: true,
    ),
  ];
}

List<String> _buildRecentAchievements(
  SubscriptionStatus? status,
  SubscriptionEntitlementTier tier,
) {
  final achievements = <String>[
    'Subscription entitlement active: ${tier.name}',
  ];

  if (status?.isPaid == true) {
    achievements.add('Paid tier entitlements active');
  }
  if (status?.isExpiring == true && status?.currentPeriodEnd != null) {
    achievements.add(
      'Renews through ${status!.currentPeriodEnd!.toLocal().toIso8601String().split('T').first}',
    );
  }

  return achievements;
}

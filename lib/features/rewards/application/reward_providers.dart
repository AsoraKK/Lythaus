// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

final rewardsSnapshotProvider = FutureProvider<RewardsSnapshot>((ref) async {
  final dio = ref.read(secureDioProvider);
  final response = await dio.get<Map<String, dynamic>>('/rewards/me');
  final data = response.data;
  if (data == null) {
    throw StateError('Empty response from rewards endpoint');
  }
  return RewardsSnapshot.fromJson(data);
});

final redeemRewardProvider = FutureProvider.family<RewardRedemption, String>((
  ref,
  rewardId,
) async {
  final dio = ref.read(secureDioProvider);
  final response = await dio.post<Map<String, dynamic>>(
    '/rewards/$rewardId/redeem',
  );
  final data = response.data;
  if (data == null) {
    throw StateError('Empty response from reward redemption endpoint');
  }
  return RewardRedemption.fromJson(data);
});

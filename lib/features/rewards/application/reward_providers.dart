// ignore_for_file: public_member_api_docs

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

Future<(Dio, CancelToken, String)> _monthlyReadContext(
  Ref ref, {
  String unauthenticatedMessage = 'Sign in to view monthly rewards',
  int? expectedSessionRevision,
}) async {
  final sessionRevision = ref.watch(authSessionRevisionProvider);
  final session = ref.read(authSessionRevisionProvider.notifier);
  if (expectedSessionRevision != null &&
      expectedSessionRevision != sessionRevision) {
    throw StateError('Session changed');
  }
  final user = ref.watch(currentUserProvider);
  if (user == null) throw StateError(unauthenticatedMessage);
  final cancelToken = CancelToken();
  final stop = session.cancelOnChange(cancelToken.cancel);
  ref.onDispose(stop);
  ref.onDispose(cancelToken.cancel);
  final token = await Future.any<String?>([
    ref.watch(jwtProvider.future),
    cancelToken.whenCancel.then<String?>((error) => throw error),
  ]);
  if (cancelToken.isCancelled) throw cancelToken.cancelError!;
  if (token == null || token.isEmpty) throw StateError('Session expired');
  return (ref.watch(secureDioProvider), cancelToken, token);
}

final rewardsSnapshotProvider = FutureProvider.autoDispose
    .family<RewardsSnapshot, int>((ref, sessionRevision) async {
      final (dio, cancelToken, token) = await _monthlyReadContext(
        ref,
        unauthenticatedMessage: 'Sign in to view rewards',
        expectedSessionRevision: sessionRevision,
      );
      final response = await dio.get<Map<String, dynamic>>(
        '/rewards/me',
        cancelToken: cancelToken,
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final data = response.data;
      if (data == null) {
        throw StateError('Empty response from rewards endpoint');
      }
      return RewardsSnapshot.fromJson(data);
    });

final monthlyRewardsViewProvider =
    FutureProvider.autoDispose<MonthlyRewardsView>((ref) async {
      final (dio, cancelToken, token) = await _monthlyReadContext(ref);
      final response = await dio.get<Map<String, dynamic>>(
        '/rewards/me/monthly',
        cancelToken: cancelToken,
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final data = response.data;
      if (data == null) throw StateError('Empty monthly rewards response');
      return MonthlyRewardsView.fromJson(data);
    });

final monthlyReputationReportProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, sourceMonth) async {
      final (dio, cancelToken, token) = await _monthlyReadContext(ref);
      final response = await dio.get<Map<String, dynamic>>(
        '/reputation/me/reports/monthly/$sourceMonth',
        cancelToken: cancelToken,
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final data = response.data;
      if (data == null) throw StateError('Empty monthly reputation report');
      return data;
    });

final monthlyReputationCsvProvider = FutureProvider.autoDispose
    .family<Uint8List, String>((ref, sourceMonth) async {
      final (dio, cancelToken, token) = await _monthlyReadContext(ref);
      final response = await dio.get<List<int>>(
        '/reputation/me/reports/monthly/$sourceMonth/export.csv',
        cancelToken: cancelToken,
        options: Options(
          responseType: ResponseType.bytes,
          headers: {'Authorization': 'Bearer $token', 'Accept': 'text/csv'},
        ),
      );
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final data = response.data;
      if (data == null) throw StateError('Empty monthly CSV report');
      return Uint8List.fromList(data);
    });

typedef RewardRedemptionRequest = ({
  String rewardId,
  int sessionRevision,
  String idempotencyKey,
});

final redeemRewardProvider = FutureProvider.autoDispose
    .family<RewardRedemption, RewardRedemptionRequest>((ref, request) async {
      final (dio, cancelToken, token) = await _monthlyReadContext(
        ref,
        unauthenticatedMessage: 'Sign in to redeem rewards',
        expectedSessionRevision: request.sessionRevision,
      );
      final requestFuture = dio.post<Map<String, dynamic>>(
        '/rewards/${request.rewardId}/redeem',
        cancelToken: cancelToken,
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Idempotency-Key': request.idempotencyKey,
          },
          extra: {
            IdempotencyRetryInterceptor.disableAutomaticRetryExtraKey: true,
          },
        ),
      );
      final response = await requestFuture;
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final data = response.data;
      if (data == null) {
        throw StateError('Empty response from reward redemption endpoint');
      }
      return RewardRedemption.fromJson(data);
    });

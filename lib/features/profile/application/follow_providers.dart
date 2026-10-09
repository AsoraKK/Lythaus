// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';

final followServiceProvider = Provider<FollowService>((ref) {
  return FollowService(ref.watch(secureDioProvider));
});

final followStatusProvider = FutureProvider.autoDispose
    .family<FollowStatus, String>((ref, userId) async {
      final revision = ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final user = ref.watch(currentUserProvider);
      if (user == null) throw StateError('Authentication required');
      final cancelToken = CancelToken();
      final stop = session.cancelOnChange(cancelToken.cancel);
      ref.onDispose(stop);
      ref.onDispose(cancelToken.cancel);
      final token = await Future.any<String?>([
        ref.watch(jwtProvider.future),
        cancelToken.whenCancel.then<String?>((error) => throw error),
      ]);
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      if (token == null || token.isEmpty) {
        throw Exception('Authentication required');
      }
      final service = ref.watch(followServiceProvider);
      final status = await service.getStatus(
        targetUserId: userId,
        accessToken: token,
        cancelToken: cancelToken,
      );
      if (cancelToken.isCancelled ||
          ref.read(currentUserProvider)?.id != user.id ||
          ref.read(authSessionRevisionProvider) != revision) {
        throw StateError('Profile session changed');
      }
      return status;
    });

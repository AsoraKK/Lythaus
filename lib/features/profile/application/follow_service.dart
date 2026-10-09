// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';

class FollowStatus {
  final bool following;
  final bool followedBy;
  final bool blocked;

  const FollowStatus({
    required this.following,
    this.followedBy = false,
    this.blocked = false,
  });

  factory FollowStatus.fromJson(Map<String, dynamic> json) {
    return FollowStatus(
      following: json['following'] == true,
      followedBy: json['followedBy'] == true,
      blocked: json['blocked'] == true,
    );
  }
}

class FollowMutationResult {
  const FollowMutationResult({
    required this.targetUserId,
    required this.created,
    required this.removed,
  });

  final String targetUserId;
  final bool created;
  final bool removed;

  factory FollowMutationResult.fromJson(
    Map<String, dynamic> json, {
    required String expectedTargetUserId,
  }) {
    if (json['following'] != expectedTargetUserId ||
        (json['created'] != null && json['created'] is! bool) ||
        (json['removed'] != null && json['removed'] is! bool)) {
      throw const FormatException('Invalid follow mutation response');
    }
    return FollowMutationResult(
      targetUserId: expectedTargetUserId,
      created: json['created'] == true,
      removed: json['removed'] == true,
    );
  }
}

class FollowService {
  FollowService(this._dio);

  final Dio _dio;

  Future<FollowStatus> getStatus({
    required String targetUserId,
    required String accessToken,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/users/$targetUserId/follow',
      cancelToken: cancelToken,
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
    return FollowStatus.fromJson(response.data ?? const {});
  }

  Future<FollowMutationResult> follow({
    required String targetUserId,
    required String accessToken,
    required String idempotencyKey,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/users/$targetUserId/follow',
      cancelToken: cancelToken,
      options: Options(
        headers: {
          'Authorization': 'Bearer $accessToken',
          'Idempotency-Key': idempotencyKey,
        },
      ),
    );
    return FollowMutationResult.fromJson(
      response.data ?? const {},
      expectedTargetUserId: targetUserId,
    );
  }

  Future<FollowMutationResult> unfollow({
    required String targetUserId,
    required String accessToken,
    required String idempotencyKey,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      '/api/users/$targetUserId/follow',
      cancelToken: cancelToken,
      options: Options(
        headers: {
          'Authorization': 'Bearer $accessToken',
          'Idempotency-Key': idempotencyKey,
        },
      ),
    );
    return FollowMutationResult.fromJson(
      response.data ?? const {},
      expectedTargetUserId: targetUserId,
    );
  }
}

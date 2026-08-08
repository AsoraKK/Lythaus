// ignore_for_file: public_member_api_docs

/// LYTHAUS FEED SERVICE
///
/// 🎯 Purpose: Implementation of feed repository interface
/// 🏗️ Architecture: Application layer - implements domain contracts
/// 🔐 Dependency Rule: Depends on domain interfaces, implements concrete behavior
/// 📱 Platform: Flutter with Dio HTTP client
library;

import 'package:dio/dio.dart';
import 'package:lythaus/features/feed/domain/feed_repository.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/core/observability/lythaus_tracer.dart';

/// Concrete implementation of [FeedRepository]
///
/// This service implements the repository pattern by:
/// - Depending on domain interfaces (implements FeedRepository)
/// - Handling HTTP communication and data mapping
/// - Converting API responses to domain models
/// - Throwing domain exceptions on failures
class FeedService implements FeedRepository {
  final Dio _dio;

  FeedService(this._dio);

  @override
  Future<AppealResponse> getVotingFeed({
    int page = 1,
    int pageSize = 20,
    AppealFilters? filters,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'FeedService.getVotingFeed',
      () async {
        final queryParams = <String, dynamic>{
          'page': page,
          'pageSize': pageSize,
          if (filters != null) ...filters.toJson(),
        };

        final response = await _dio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: queryParams,
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (data != null && data['success'] == true) {
          return AppealResponse.fromJson(data);
        }
        final message = data?['message'] as String?;
        throw FeedException(
          message ?? 'Failed to load voting feed',
          code: 'LOAD_FEED_FAILED',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: '/api/reviewAppealedContent',
          )..addAll({
            'request.page': page,
            'request.page_size': pageSize,
            'request.has_filters': filters != null,
            if (filters != null)
              'request.filter_count': filters.toJson().length,
          }),
      onError: (error) {
        if (error is DioException) {
          throw FeedException(
            'Network error: ${error.message}',
            code: 'NETWORK_ERROR',
            originalError: error,
          );
        }
        throw FeedException(
          'Unexpected error: $error',
          code: 'UNKNOWN_ERROR',
          originalError: error,
        );
      },
    );
  }

  @override
  Future<List<UserVote>> getVotingHistory({
    required String token,
    int page = 1,
    int pageSize = 20,
  }) async {
    return LythausTracer.traceOperation(
      'FeedService.getVotingHistory',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/api/getMyVotes',
          queryParameters: {'page': page, 'pageSize': pageSize},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        final votes = data?['votes'];
        if (data != null && data['success'] == true && votes is List) {
          return votes
              .whereType<Map<String, dynamic>>()
              .map((vote) => UserVote.fromJson(Map<String, dynamic>.from(vote)))
              .toList();
        }
        final message = data?['message'] as String?;
        throw FeedException(
          message ?? 'Failed to load voting history',
          code: 'LOAD_HISTORY_FAILED',
        );
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: '/api/getMyVotes',
      )..addAll({'request.page': page, 'request.page_size': pageSize}),
      onError: (error) {
        if (error is DioException) {
          throw FeedException(
            'Network error: ${error.message}',
            code: 'NETWORK_ERROR',
            originalError: error,
          );
        }
        throw FeedException(
          'Unexpected error: $error',
          code: 'UNKNOWN_ERROR',
          originalError: error,
        );
      },
    );
  }

  @override
  Future<FeedMetrics> getFeedMetrics({required String token}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/getFeedMetrics',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      final data = response.data;
      final metrics = data?['metrics'];
      if (data != null && data['success'] == true && metrics is Map) {
        return FeedMetrics.fromJson(Map<String, dynamic>.from(metrics));
      }
      final message = data?['message'] as String?;
      throw FeedException(
        message ?? 'Failed to load feed metrics',
        code: 'LOAD_METRICS_FAILED',
      );
    } on DioException catch (e) {
      throw FeedException(
        'Network error: ${e.message}',
        code: 'NETWORK_ERROR',
        originalError: e,
      );
    } catch (e) {
      throw FeedException(
        'Unexpected error: $e',
        code: 'UNKNOWN_ERROR',
        originalError: e,
      );
    }
  }
}

// ignore_for_file: public_member_api_docs

library social_feed_service;

/// LYTHAUS SOCIAL FEED SERVICE
///
/// 🎯 Purpose: Implementation of social feed repository interface
/// 🏗️ Architecture: Application layer - implements domain contracts
/// 🔐 Dependency Rule: Depends on domain interfaces, implements concrete behavior
/// 📱 Platform: Flutter with Dio HTTP client

import 'package:dio/dio.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/observability/lythaus_tracer.dart';

/// Concrete implementation of [SocialFeedRepository]
///
/// This service handles HTTP communication for social media feed operations:
/// - Converting API responses to domain models
/// - Handling pagination and caching
/// - Managing AI moderation data integration
/// - Throwing domain exceptions on failures
class SocialFeedService implements SocialFeedRepository {
  final Dio _dio;
  final String _baseUrl;

  SocialFeedService(this._dio, {String? baseUrl})
    : _baseUrl = baseUrl ?? _dio.options.baseUrl;

  Future<FeedResponse> _fetchCursorFeed({
    required String operation,
    required String urlPath,
    int limit = 25,
    String? cursor,
    String? token,
    Map<String, dynamic>? extraQuery,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.$operation',
      () async {
        final queryParameters = <String, dynamic>{
          'limit': limit,
          if (cursor != null) 'cursor': cursor,
          if (extraQuery != null) ...extraQuery,
        };

        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl$urlPath',
          queryParameters: queryParameters,
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid feed response',
            code: 'INVALID_RESPONSE',
          );
        }

        final rawItems = data['items'];
        final posts =
            (rawItems as List<dynamic>?)
                ?.whereType<Map<String, dynamic>>()
                .map(Post.fromJson)
                .toList() ??
            [];

        return FeedResponse.fromCursor(
          posts: posts,
          nextCursor: data['nextCursor'] as String?,
          limit: limit,
        );
      },
      attributes: () {
        final attrs =
            LythausTracer.httpRequestAttributes(
              method: 'GET',
              url: '/api$urlPath',
            )..addAll({
              'request.limit': limit,
              'request.cursor_present': cursor != null,
              'request.has_token': token != null,
            });
        if (extraQuery != null && extraQuery.isNotEmpty) {
          attrs['request.extra_params'] = extraQuery.keys.join(',');
        }
        return attrs;
      }(),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) {
    return _fetchCursorFeed(
      operation: 'getDiscoverFeed',
      urlPath: '/feed/discover',
      cursor: cursor,
      limit: limit,
      token: token,
    );
  }

  @override
  Future<FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) {
    return _fetchCursorFeed(
      operation: 'getNewsFeed',
      urlPath: '/feed/news',
      cursor: cursor,
      limit: limit,
      token: token,
    );
  }

  @override
  Future<FeedResponse> getUserFeed({
    required String userId,
    String? cursor,
    int limit = 25,
    String? token,
    bool includeReplies = false,
  }) {
    final extra = includeReplies ? {'includeReplies': 'true'} : null;
    return _fetchCursorFeed(
      operation: 'getUserFeed',
      urlPath: '/feed/user/$userId',
      cursor: cursor,
      limit: limit,
      token: token,
      extraQuery: extra,
    );
  }

  @override
  Future<FeedResponse> getFeed({
    required FeedParams params,
    String? token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getFeed',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/feed',
          queryParameters: params.toJson(),
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid feed response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] == true) {
          final payload = data['data'];
          if (payload is! Map<String, dynamic>) {
            throw const SocialFeedException(
              'Invalid feed response',
              code: 'INVALID_RESPONSE',
            );
          }
          return FeedResponse.fromJson(payload);
        }

        final message = data['message'];
        throw SocialFeedException(
          message is String ? message : 'Failed to load feed',
          code: 'LOAD_FEED_FAILED',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(method: 'GET', url: '/api/feed')
            ..addAll({
              'request.page': params.page,
              'request.page_size': params.pageSize,
              'request.feed_type': params.type.name,
              'request.has_token': token != null,
            }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<FeedResponse> getTrendingFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getTrendingFeed',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/feed/trending',
          queryParameters: {'page': page, 'pageSize': pageSize},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        return _handleFeedResponse(response);
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: '/api/feed/trending',
      )..addAll({'request.page': page, 'request.page_size': pageSize}),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<FeedResponse> getLocalFeed({
    required String location,
    double? radius,
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getLocalFeed',
      () async {
        final queryParams = <String, Object>{
          'location': location,
          'page': page,
          'pageSize': pageSize,
          if (radius != null) 'radius': radius,
        };

        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/feed/local',
          queryParameters: queryParams,
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        return _handleFeedResponse(response);
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: '/api/feed/local',
          )..addAll({
            'request.location': location,
            'request.radius': radius?.toString() ?? 'null',
            'request.page': page,
            'request.page_size': pageSize,
          }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<FeedResponse> getNewCreatorsFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getNewCreatorsFeed',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/feed/new-creators',
          queryParameters: {'page': page, 'pageSize': pageSize},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        return _handleFeedResponse(response);
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: '/api/feed/new-creators',
      )..addAll({'request.page': page, 'request.page_size': pageSize}),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<FeedResponse> getFollowingFeed({
    int page = 1,
    int pageSize = 20,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getFollowingFeed',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/feed/following',
          queryParameters: {'page': page, 'pageSize': pageSize},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        return _handleFeedResponse(response);
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: '/api/feed/following',
      )..addAll({'request.page': page, 'request.page_size': pageSize}),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<Post> getPost({required String postId, String? token}) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getPost',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/posts/$postId',
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid post response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] == true) {
          final payload = data['post'];
          if (payload is! Map<String, dynamic>) {
            throw const SocialFeedException(
              'Invalid post response',
              code: 'INVALID_RESPONSE',
            );
          }
          return Post.fromJson(payload);
        }

        final message = data['message'];
        throw SocialFeedException(
          message is String ? message : 'Post not found',
          code: 'POST_NOT_FOUND',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: '/api/posts/$postId',
          )..addAll({
            'request.post_id': postId,
            'request.has_token': token != null,
          }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<Post> likePost({
    required String postId,
    required bool isLike,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.likePost',
      () async {
        final response = await _dio.post<Map<String, dynamic>>(
          '$_baseUrl/posts/$postId/like',
          data: {'action': isLike ? 'like' : 'unlike'},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid like response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] == true) {
          final payload = data['post'];
          if (payload is! Map<String, dynamic>) {
            throw const SocialFeedException(
              'Invalid like response',
              code: 'INVALID_RESPONSE',
            );
          }
          return Post.fromJson(payload);
        }

        final message = data['message'];
        throw SocialFeedException(
          message is String ? message : 'Failed to update like',
          code: 'LIKE_FAILED',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'POST',
            url: '/api/posts/$postId/like',
          )..addAll({
            'request.post_id': postId,
            'request.action': isLike ? 'like' : 'unlike',
          }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<Post> dislikePost({
    required String postId,
    required bool isDislike,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.dislikePost',
      () async {
        final response = await _dio.post<Map<String, dynamic>>(
          '$_baseUrl/posts/$postId/dislike',
          data: {'action': isDislike ? 'dislike' : 'remove_dislike'},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid dislike response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] == true) {
          final payload = data['post'];
          if (payload is! Map<String, dynamic>) {
            throw const SocialFeedException(
              'Invalid dislike response',
              code: 'INVALID_RESPONSE',
            );
          }
          return Post.fromJson(payload);
        }

        final message = data['message'];
        throw SocialFeedException(
          message is String ? message : 'Failed to update dislike',
          code: 'DISLIKE_FAILED',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'POST',
            url: '/api/posts/$postId/dislike',
          )..addAll({
            'request.post_id': postId,
            'request.action': isDislike ? 'dislike' : 'remove_dislike',
          }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<List<Comment>> getComments({
    required String postId,
    int page = 1,
    int pageSize = 50,
    String? token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.getComments',
      () async {
        final response = await _dio.get<Map<String, dynamic>>(
          '$_baseUrl/posts/$postId/comments',
          queryParameters: {'page': page, 'pageSize': pageSize},
          options: Options(
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          ),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid comments response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] == true) {
          final commentsData = data['comments'];
          if (commentsData is! List) {
            throw const SocialFeedException(
              'Invalid comments response',
              code: 'INVALID_RESPONSE',
            );
          }
          return commentsData
              .whereType<Map<String, dynamic>>()
              .map(Comment.fromJson)
              .toList();
        }

        final message = data['message'];
        throw SocialFeedException(
          message is String ? message : 'Failed to load comments',
          code: 'LOAD_COMMENTS_FAILED',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: '/api/posts/$postId/comments',
          )..addAll({
            'request.post_id': postId,
            'request.page': page,
            'request.page_size': pageSize,
          }),
      onError: (error) => _handleError(error),
    );
  }

  @override
  Future<void> flagPost({
    required String postId,
    required String reason,
    String? details,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'SocialFeedService.flagPost',
      () async {
        final response = await _dio.post<Map<String, dynamic>>(
          '$_baseUrl/posts/$postId/flag',
          data: {'reason': reason, if (details != null) 'details': details},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (data == null) {
          throw const SocialFeedException(
            'Invalid flag response',
            code: 'INVALID_RESPONSE',
          );
        }

        if (data['success'] != true) {
          final message = data['message'];
          throw SocialFeedException(
            message is String ? message : 'Failed to flag post',
            code: 'FLAG_FAILED',
          );
        }
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'POST',
            url: '/api/posts/$postId/flag',
          )..addAll({
            'request.post_id': postId,
            'request.reason': reason,
            'request.has_details': details != null,
          }),
      onError: (error) => _handleError(error),
    );
  }

  /// Helper method to handle feed response parsing
  FeedResponse _handleFeedResponse(Response<Map<String, dynamic>> response) {
    final data = response.data;
    if (data == null) {
      throw const SocialFeedException(
        'Invalid feed response',
        code: 'INVALID_RESPONSE',
      );
    }

    if (data['success'] == true) {
      final payload = data['data'];
      if (payload is! Map<String, dynamic>) {
        throw const SocialFeedException(
          'Invalid feed response',
          code: 'INVALID_RESPONSE',
        );
      }
      return FeedResponse.fromJson(payload);
    }

    final message = data['message'];
    throw SocialFeedException(
      message is String ? message : 'Failed to load feed',
      code: 'LOAD_FEED_FAILED',
    );
  }

  /// Helper method to handle and convert errors
  Never _handleError(dynamic error) {
    if (error is DioException) {
      final data = error.response?.data;
      String? code;
      if (data is Map<String, dynamic>) {
        if (data['code'] is String) {
          code = data['code'] as String;
        } else if (data['error'] is Map<String, dynamic>) {
          final nested = data['error'] as Map<String, dynamic>;
          if (nested['code'] is String) {
            code = nested['code'] as String;
          }
        }
      }
      if (code == ErrorCodes.deviceIntegrityBlocked) {
        throw SocialFeedException(
          ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked),
          code: ErrorCodes.deviceIntegrityBlocked,
          originalError: error,
        );
      }
      throw SocialFeedException(
        'Network error: ${error.message}',
        code: 'NETWORK_ERROR',
        originalError: error,
      );
    }
    throw SocialFeedException(
      'Unexpected error: $error',
      code: 'UNKNOWN_ERROR',
      originalError: error,
    );
  }
}

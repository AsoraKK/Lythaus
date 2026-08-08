// ignore_for_file: public_member_api_docs

/// LYTHAUS POST SERVICE
///
/// 🎯 Purpose: HTTP client for post management API calls
/// 📡 Endpoints: create, delete, and feed reads through the native Lythaus API
/// 🔐 Authentication: Bearer token from secure storage
/// 📱 Platform: Flutter with Dio HTTP client
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lythaus/core/observability/lythaus_tracer.dart';
import 'package:lythaus/features/auth/domain/user_models.dart';
import 'package:lythaus/core/network/response_models.dart';

/// Post management service for the native Lythaus API
class PostService {
  final Dio _dio;

  PostService(this._dio);

  /// Create a new post with AI moderation
  Future<PostCreateResponse> createPost({
    required String text,
    String? mediaUrl,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'PostService.createPost',
      () async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/api/posts',
          data: {'text': text, if (mediaUrl != null) 'mediaUrl': mediaUrl},
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (response.statusCode == 201 && data != null) {
          debugPrint('✅ Post created successfully: ${data['postId']}');
          return PostCreateResponse.fromJson(data);
        }
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          message: 'Failed to create post: ${response.data}',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(method: 'POST', url: '/api/posts')
            ..addAll({
              'request.text_length': text.length,
              'request.has_media': mediaUrl != null,
            }),
    );
  }

  /// Delete a post (user can delete own posts, admins can delete any)
  Future<Map<String, dynamic>> deletePost({
    required String postId,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'PostService.deletePost',
      () async {
        final response = await _dio.delete<Map<String, dynamic>>(
          '/api/posts/$postId',
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (response.statusCode == 204) {
          debugPrint('✅ Post deleted successfully: $postId');
          return {'success': true, 'postId': postId};
        }

        if (response.statusCode == 200 && data?['success'] == true) {
          debugPrint('✅ Post deleted successfully: $postId');
          return data!;
        }
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          message: 'Failed to delete post: ${response.data}',
        );
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'DELETE',
        url: '/api/posts/$postId',
      )..addAll({'request.post_id': postId}),
    );
  }

  /// Get feed with cursor-based pagination.
  Future<FeedResponse> getFeed({
    int limit = 20,
    String? cursor,
    String? token, // Optional for public feed
  }) async {
    return LythausTracer.traceOperation(
      'PostService.getFeed',
      () async {
        final queryParams = <String, dynamic>{
          'limit': limit,
          if (cursor != null) 'cursor': cursor,
        };

        final response = await _dio.get<Map<String, dynamic>>(
          '/api/feed',
          queryParameters: queryParams,
          options: Options(
            headers: {if (token != null) 'Authorization': 'Bearer $token'},
          ),
        );

        final data = response.data;
        if (response.statusCode == 200 && data != null) {
          debugPrint(
            '✅ Feed fetched successfully: ${data['feed']?.length ?? 0} posts',
          );
          return FeedResponse.fromJson(data);
        }
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          message: 'Failed to fetch feed: ${response.data}',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(method: 'GET', url: '/api/feed')
            ..addAll({
              'request.limit': limit,
              'request.has_cursor': cursor != null,
              'request.authenticated': token != null,
            }),
    );
  }

  /// Get user profile with statistics
  Future<UserProfileResponse> getUserProfile({
    String? userId, // If null, gets own profile
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'PostService.getUserProfile',
      () async {
        final url = userId != null ? '/api/user/$userId' : '/api/user';

        final response = await _dio.get<Map<String, dynamic>>(
          url,
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        final data = response.data;
        if (response.statusCode == 200 && data != null) {
          debugPrint(
            '✅ User profile fetched successfully: ${data['user']?['id']}',
          );
          return UserProfileResponse.fromJson(data);
        }
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          message: 'Failed to fetch user profile: ${response.data}',
        );
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: userId != null ? '/api/user/$userId' : '/api/user',
          )..addAll({
            'request.is_own_profile': userId == null,
            'request.target_user_id': userId ?? 'self',
          }),
    );
  }

  /// Check health of the native Lythaus API.
  Future<Map<String, dynamic>> checkHealth() async {
    return LythausTracer.traceOperation(
      'PostService.checkHealth',
      () async {
        final response = await _dio.get<Map<String, dynamic>>('/api/health');

        final data = response.data;
        if (response.statusCode == 200 && data != null) {
          debugPrint('✅ Backend health check successful');
          return data;
        }
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          message: 'Health check failed: ${response.data}',
        );
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'GET',
        url: '/api/health',
      ),
    );
  }
}

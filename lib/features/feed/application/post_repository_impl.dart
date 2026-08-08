// ignore_for_file: public_member_api_docs

/// LYTHAUS POST SERVICE IMPLEMENTATION
///
/// 🎯 Purpose: HTTP client implementation for post repository
/// 🏗️ Architecture: Application layer - implements domain contracts
/// 📡 Endpoints: POST/PATCH /posts, DELETE /posts/{id}, GET /posts/{id}
/// 🔐 Authentication: Bearer token from secure storage
/// 📱 Platform: Flutter with Dio HTTP client
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lythaus/core/observability/lythaus_tracer.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';

/// Post repository implementation using Dio HTTP client
class PostRepositoryImpl implements PostRepository {
  final Dio _dio;

  PostRepositoryImpl(this._dio);

  @override
  Future<CreatePostResult> createPost({
    required CreatePostRequest request,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'PostRepository.createPost',
      () async {
        try {
          final response = await _dio.post<Map<String, dynamic>>(
            '/api/posts',
            data: request.toJson(),
            options: Options(headers: {'Authorization': 'Bearer $token'}),
          );

          if (response.statusCode == 201) {
            debugPrint('✅ Post created successfully');
            final data = response.data as Map<String, dynamic>;
            return CreatePostSuccess(_parsePost(data));
          }

          // Shouldn't reach here normally, but handle unexpected success codes
          return CreatePostError(
            message: 'Unexpected response status: ${response.statusCode}',
            code: 'unexpected_status',
          );
        } on DioException catch (e) {
          return _handleDioError(e);
        } catch (e) {
          debugPrint('❌ Post creation failed: $e');
          return CreatePostError(
            message: 'Failed to create post: ${e.toString()}',
            originalError: e,
          );
        }
      },
      attributes:
          LythausTracer.httpRequestAttributes(method: 'POST', url: '/api/posts')
            ..addAll({
              'request.text_length': request.text.length,
              'request.has_media': request.mediaUrl != null,
              'request.is_news': request.isNews,
              'request.content_type': request.contentType,
            }),
    );
  }

  @override
  Future<CreatePostResult> updatePost({
    required String postId,
    required UpdatePostRequest request,
    required String token,
  }) async {
    if (request.isEmpty) {
      return const CreatePostError(
        message: 'No post updates were provided',
        code: 'invalid_request',
      );
    }

    return LythausTracer.traceOperation(
      'PostRepository.updatePost',
      () async {
        try {
          final response = await _dio.patch<Map<String, dynamic>>(
            '/api/posts/$postId',
            data: request.toJson(),
            options: Options(headers: {'Authorization': 'Bearer $token'}),
          );

          if (response.statusCode == 200) {
            final data = response.data as Map<String, dynamic>;
            final postData = data['post'] as Map<String, dynamic>? ?? data;
            return CreatePostSuccess(_parsePost(postData));
          }

          return CreatePostError(
            message: 'Unexpected response status: ${response.statusCode}',
            code: 'unexpected_status',
          );
        } on DioException catch (e) {
          return _handleDioError(e);
        } catch (e) {
          return CreatePostError(
            message: 'Failed to update post: ${e.toString()}',
            originalError: e,
          );
        }
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'PATCH',
            url: '/api/posts/$postId',
          )..addAll({
            'request.post_id': postId,
            'request.updates': request.toJson().keys.join(','),
          }),
    );
  }

  @override
  Future<bool> deletePost({
    required String postId,
    required String token,
  }) async {
    return LythausTracer.traceOperation(
      'PostRepository.deletePost',
      () async {
        try {
          final response = await _dio.delete<dynamic>(
            '/api/posts/$postId',
            options: Options(headers: {'Authorization': 'Bearer $token'}),
          );

          if (response.statusCode == 204) {
            return true;
          }

          if (response.statusCode == 200) {
            final data = response.data;
            if (data is Map<String, dynamic>) {
              return data['success'] == true;
            }
            return false;
          }

          throw PostException(
            'Failed to delete post: ${response.statusCode}',
            code: 'delete_failed',
          );
        } on DioException catch (e) {
          final message = _extractErrorMessage(e);
          throw PostException(message, code: 'network_error', originalError: e);
        }
      },
      attributes: LythausTracer.httpRequestAttributes(
        method: 'DELETE',
        url: '/api/posts/$postId',
      )..addAll({'request.post_id': postId}),
    );
  }

  @override
  Future<Post> getPost({required String postId, String? token}) async {
    return LythausTracer.traceOperation(
      'PostRepository.getPost',
      () async {
        try {
          final response = await _dio.get<Map<String, dynamic>>(
            '/api/posts/$postId',
            options: Options(
              headers: {if (token != null) 'Authorization': 'Bearer $token'},
            ),
          );

          if (response.statusCode == 200) {
            final data = response.data as Map<String, dynamic>;
            final postData = data['post'] as Map<String, dynamic>? ?? data;
            return _parsePost(postData);
          }

          throw PostException(
            'Failed to fetch post: ${response.statusCode}',
            code: 'fetch_failed',
          );
        } on DioException catch (e) {
          if (e.response?.statusCode == 404) {
            throw const PostException('Post not found', code: 'not_found');
          }
          final message = _extractErrorMessage(e);
          throw PostException(message, code: 'network_error', originalError: e);
        }
      },
      attributes:
          LythausTracer.httpRequestAttributes(
            method: 'GET',
            url: '/api/posts/$postId',
          )..addAll({
            'request.post_id': postId,
            'request.authenticated': token != null,
          }),
    );
  }

  /// Handle Dio errors and convert to appropriate CreatePostResult
  CreatePostResult _handleDioError(DioException e) {
    final response = e.response;

    if (response == null) {
      return CreatePostError(
        message: 'Network error: ${e.message}',
        code: 'network_error',
        originalError: e,
      );
    }

    final statusCode = response.statusCode;
    final payload = _errorPayload(e);
    final code = payload?['code'] as String?;
    final message =
        payload?['message'] as String? ??
        payload?['error'] as String? ??
        'Request failed';
    final details = payload?['details'] as Map<String, dynamic>?;

    if ((statusCode == 400 || statusCode == 422) &&
        (code == 'CONTENT_BLOCKED' ||
            code == 'content_blocked' ||
            code == ErrorCodes.aiContentBlocked ||
            code == ErrorCodes.aiLabelRequired)) {
      final categories =
          (details?['categories'] as List<dynamic>?)
              ?.whereType<String>()
              .toList() ??
          [];
      debugPrint('⚠️ Post blocked by content moderation');
      return CreatePostBlocked(
        message: message,
        categories: categories,
        code: code ?? 'content_blocked',
        appealEligible: details?['appealEligible'] == true,
        appealCaseId: details?['caseId'] as String?,
      );
    }

    if (statusCode == 429 && code == 'daily_post_limit_reached') {
      debugPrint('⚠️ Daily post limit exceeded');
      final retryAfterSeconds =
          int.tryParse(response.headers.value('retry-after') ?? '86400') ??
          86400;
      return CreatePostLimitExceeded(
        message: message,
        limit: details?['limit'] as int? ?? 10,
        currentCount: details?['current'] as int? ?? 0,
        tier: details?['tier'] as String? ?? 'free',
        retryAfter: Duration(seconds: retryAfterSeconds),
      );
    }

    if (statusCode == 400) {
      return CreatePostError(
        message: message,
        code: code ?? 'validation_error',
        originalError: e,
      );
    }

    if (statusCode == 401) {
      return CreatePostError(
        message: 'Authentication required',
        code: 'auth_required',
        originalError: e,
      );
    }

    if (statusCode == 403) {
      if (code == ErrorCodes.deviceIntegrityBlocked) {
        return CreatePostError(
          message: ErrorMessages.forCode(ErrorCodes.deviceIntegrityBlocked),
          code: ErrorCodes.deviceIntegrityBlocked,
          originalError: e,
        );
      }
      return CreatePostError(
        message: 'You are not allowed to create posts',
        code: 'forbidden',
        originalError: e,
      );
    }

    if (statusCode == 404) {
      return CreatePostError(
        message: 'User not found',
        code: 'not_found',
        originalError: e,
      );
    }

    final errorMessage = _extractErrorMessage(e);
    return CreatePostError(
      message: errorMessage,
      code: 'api_error',
      originalError: e,
    );
  }

  /// Extract error message from DioException
  String _extractErrorMessage(DioException e) {
    final payload = _errorPayload(e);
    return payload?['message'] as String? ??
        payload?['error'] as String? ??
        e.message ??
        'Request failed';
  }

  Map<String, dynamic>? _errorPayload(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final errorSection = data['error'];
      if (errorSection is Map<String, dynamic>) {
        return errorSection;
      }
      return data;
    }
    return null;
  }

  /// Parse post from JSON response
  Post _parsePost(Map<String, dynamic> json) {
    return Post.fromJson(json);
  }
}

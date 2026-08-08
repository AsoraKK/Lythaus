// ignore_for_file: public_member_api_docs

/// LYTHAUS POST INSIGHTS PROVIDERS
///
/// 🎯 Purpose: Riverpod providers for fetching post insights
/// 🏗️ Architecture: Application layer - manages state and API calls
/// 🔐 Authorization: Insights only available to post author or admin
/// 📱 Platform: Flutter with Riverpod
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

/// Result type for insights fetch
sealed class InsightsResult {}

/// Successful insights fetch
class InsightsSuccess extends InsightsResult {
  final PostInsights insights;
  InsightsSuccess(this.insights);
}

/// Access denied (403) - user is not author or admin
class InsightsAccessDenied extends InsightsResult {}

/// Post not found (404)
class InsightsNotFound extends InsightsResult {}

/// Error fetching insights
class InsightsError extends InsightsResult {
  final String message;
  final dynamic originalError;
  InsightsError(this.message, [this.originalError]);
}

/// Provider family for fetching post insights by post ID
///
/// Automatically refetches when token changes (auth state change).
/// Returns null if access is denied or post not found.
final postInsightsProvider = FutureProvider.autoDispose
    .family<InsightsResult, String>((ref, postId) async {
      // Watch token version to invalidate on auth changes
      ref.watch(tokenVersionProvider);

      final dio = ref.watch(secureDioProvider);
      final authState = ref.watch(authStateProvider);

      // Get current auth token
      final user = authState.valueOrNull;
      if (user == null) {
        // Not authenticated - can't fetch insights
        return InsightsAccessDenied();
      }

      try {
        // Fetch token from auth service
        final authService = ref.read(enhancedAuthServiceProvider);
        final token = await authService.getJwtToken();

        if (token == null) {
          return InsightsAccessDenied();
        }

        final response = await dio.get<Map<String, dynamic>>(
          '/api/posts/$postId/insights',
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );

        if (response.statusCode == 200 && response.data != null) {
          final insights = PostInsights.fromJson(response.data!);
          return InsightsSuccess(insights);
        }

        return InsightsError('Unexpected response: ${response.statusCode}');
      } on DioException catch (e) {
        if (e.response?.statusCode == 403) {
          // Access denied - not author or admin
          debugPrint('📊 Insights access denied for post $postId');
          return InsightsAccessDenied();
        }
        if (e.response?.statusCode == 404) {
          // Post not found
          debugPrint('📊 Post $postId not found for insights');
          return InsightsNotFound();
        }
        if (e.response?.statusCode == 401) {
          // Unauthorized - session expired
          return InsightsAccessDenied();
        }

        debugPrint('📊 Error fetching insights for post $postId: ${e.message}');
        return InsightsError('Failed to fetch insights: ${e.message}', e);
      } catch (e) {
        debugPrint('📊 Unexpected error fetching insights: $e');
        return InsightsError('Failed to fetch insights', e);
      }
    });

/// Helper to check if insights are available for display
///
/// Returns true only if insights were successfully fetched.
/// Does not return true for access denied or not found cases.
bool isInsightsAvailable(AsyncValue<InsightsResult> asyncResult) {
  return asyncResult.valueOrNull is InsightsSuccess;
}

/// Extract insights from result, returns null if not available
PostInsights? getInsights(AsyncValue<InsightsResult> asyncResult) {
  final result = asyncResult.valueOrNull;
  if (result is InsightsSuccess) {
    return result.insights;
  }
  return null;
}

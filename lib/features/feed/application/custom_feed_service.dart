// ignore_for_file: public_member_api_docs

library custom_feed_service;

import 'package:dio/dio.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;

class CustomFeedService {
  const CustomFeedService(this._dio);

  final Dio _dio;

  Future<List<FeedModel>> listCustomFeeds({
    required String token,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/custom-feeds',
      queryParameters: {'limit': limit},
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );

    final payload = _unwrapEnvelope(response.data);
    final rawItems = payload['items'];
    if (rawItems is! List) {
      return const [];
    }

    return rawItems
        .whereType<Map<String, dynamic>>()
        .map(_mapFeedDefinition)
        .toList();
  }

  Future<domain.FeedResponse> getCustomFeedItems({
    required String token,
    required String feedId,
    String? cursor,
    int limit = 25,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/custom-feeds/$feedId/items',
      queryParameters: {
        'limit': limit,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );

    final payload = _unwrapEnvelope(response.data);
    final rawItems = payload['items'];
    final posts =
        (rawItems as List<dynamic>?)
            ?.whereType<Map<String, dynamic>>()
            .map(domain.Post.fromJson)
            .toList() ??
        const <domain.Post>[];

    return domain.FeedResponse.fromCursor(
      posts: posts,
      nextCursor: payload['nextCursor'] as String?,
      limit: limit,
    );
  }

  Future<FeedModel> createCustomFeed({
    required String token,
    required CustomFeedDraft draft,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/custom-feeds',
      data: {
        'name': draft.name.trim(),
        'contentType': _contentTypeToApi(draft.contentType),
        'sorting': _sortingToApi(draft.sorting),
        'includeKeywords': draft.refinements.includeKeywords,
        'excludeKeywords': draft.refinements.excludeKeywords,
        'includeAccounts': draft.refinements.includeAccounts,
        'excludeAccounts': draft.refinements.excludeAccounts,
        'isHome': draft.setAsHome,
      },
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );

    final payload = _unwrapEnvelope(response.data);
    return _mapFeedDefinition(payload);
  }

  FeedModel _mapFeedDefinition(Map<String, dynamic> json) {
    final contentType = _parseContentType(json['contentType'] as String?);
    return FeedModel(
      id:
          json['id'] as String? ??
          'custom-${DateTime.now().millisecondsSinceEpoch}',
      name: (json['name'] as String?)?.trim().isNotEmpty == true
          ? (json['name'] as String).trim()
          : 'Custom feed',
      type: FeedType.custom,
      contentFilters: ContentFilters(
        allowedTypes: {
          if (contentType == ContentType.mixed) ...{
            ContentType.mixed,
            ContentType.text,
            ContentType.image,
            ContentType.video,
          } else
            contentType,
        },
      ),
      sorting: _parseSortingRule(json['sorting'] as String?),
      refinements: FeedRefinements(
        includeKeywords: _toStringList(json['includeKeywords']),
        excludeKeywords: _toStringList(json['excludeKeywords']),
        includeAccounts: _toStringList(json['includeAccounts']),
        excludeAccounts: _toStringList(json['excludeAccounts']),
      ),
      subscriptionLevelRequired: 0,
      isCustom: true,
      isHome: json['isHome'] as bool? ?? false,
    );
  }

  static List<String> _toStringList(Object? value) {
    if (value is! List) {
      return const <String>[];
    }
    return value
        .whereType<String>()
        .map((entry) => entry.trim())
        .where((entry) => entry.isNotEmpty)
        .toList();
  }

  static ContentType _parseContentType(String? value) {
    switch (value?.toLowerCase()) {
      case 'text':
        return ContentType.text;
      case 'image':
        return ContentType.image;
      case 'video':
        return ContentType.video;
      default:
        return ContentType.mixed;
    }
  }

  static SortingRule _parseSortingRule(String? value) {
    switch (value?.toLowerCase()) {
      case 'hot':
        return SortingRule.hot;
      case 'newest':
        return SortingRule.newest;
      case 'following':
        return SortingRule.following;
      case 'local':
        return SortingRule.local;
      default:
        return SortingRule.relevant;
    }
  }

  static String _contentTypeToApi(ContentType value) {
    switch (value) {
      case ContentType.text:
        return 'text';
      case ContentType.image:
        return 'image';
      case ContentType.video:
        return 'video';
      case ContentType.mixed:
        return 'mixed';
    }
  }

  static String _sortingToApi(SortingRule value) {
    switch (value) {
      case SortingRule.hot:
        return 'hot';
      case SortingRule.newest:
        return 'newest';
      case SortingRule.relevant:
        return 'relevant';
      case SortingRule.following:
        return 'following';
      case SortingRule.local:
        return 'local';
    }
  }

  static Map<String, dynamic> _unwrapEnvelope(Map<String, dynamic>? value) {
    if (value == null) {
      return const <String, dynamic>{};
    }
    final data = value['data'];
    if (data is Map<String, dynamic>) {
      return data;
    }
    return value;
  }
}

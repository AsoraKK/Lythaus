// ignore_for_file: public_member_api_docs
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';

final feedActionsServiceProvider = Provider(
  (ref) => FeedActionsService(ref.watch(secureDioProvider)),
);

final feedBookmarksProvider = FutureProvider<Set<String>>((ref) async {
  final session = ref.watch(feedReadSessionProvider);
  if (!session.isAuthenticated) return {};
  final token = await session.readToken();
  session.requireCurrent();
  final result = await ref.read(feedActionsServiceProvider).bookmarks(token!);
  session.requireCurrent();
  return result;
});

final confirmedUsefulProvider = StateProvider<Map<String, bool>>((ref) {
  ref.watch(feedReadSessionProvider);
  return {};
});

final pendingFeedActionsProvider = StateProvider<Map<String, String>>((ref) {
  ref.watch(feedReadSessionProvider);
  return {};
});

final feedbackExplainedProvider = StateProvider<bool>((ref) {
  ref.watch(feedReadSessionProvider);
  return false;
});

class FeedActionsService {
  FeedActionsService(this.dio);
  final Dio dio;

  Future<bool> readUseful(String postId, String token) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/posts/${Uri.encodeComponent(postId)}',
      options: _options(token),
    );
    final data = response.data?['post'] ?? response.data;
    if (data is! Map ||
        data['id'] != postId ||
        !data.containsKey('viewerReaction')) {
      throw StateError('Reaction state unavailable');
    }
    return data['viewerReaction'] == 'insightful';
  }

  Future<Set<String>> readMutes(String token) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/mutes',
      options: _options(token),
    );
    final items = response.data?['items'];
    if (items is! List) throw StateError('Mute state unavailable');
    return items.map((item) {
      if (item is! Map || item['userId'] is! String) {
        throw StateError('Invalid mute state');
      }
      return item['userId'] as String;
    }).toSet();
  }

  Options _options(String token, {bool mutation = false}) => Options(
    headers: {
      'Authorization': 'Bearer $token',
      if (mutation) 'Idempotency-Key': IdempotencyKey.create('feed-action'),
    },
  );

  Future<Set<String>> bookmarks(String token) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/bookmarks',
      options: _options(token),
    );
    final items = response.data?['items'];
    if (items is! List) throw StateError('Bookmark state unavailable');
    return items.map((item) {
      if (item is! Map || item['postId'] is! String) {
        throw StateError('Invalid bookmark state');
      }
      return item['postId'] as String;
    }).toSet();
  }

  Future<void> bookmark(String postId, bool save, String token) async {
    final response = save
        ? await dio.post<Map<String, dynamic>>(
            '/bookmarks',
            data: {'postId': postId},
            options: _options(token, mutation: true),
          )
        : await dio.delete<Map<String, dynamic>>(
            '/bookmarks/${Uri.encodeComponent(postId)}',
            options: _options(token, mutation: true),
          );
    if (response.data?['postId'] != postId ||
        response.data?['bookmarked'] != save) {
      throw StateError('Bookmark change not confirmed');
    }
  }

  Future<void> useful(String postId, bool selected, String token) =>
      reaction(postId, selected ? 'insightful' : null, token);

  Future<void> reaction(String postId, String? type, String token) async {
    if (type != null && !{'like', 'insightful', 'support'}.contains(type)) {
      throw ArgumentError.value(type, 'type');
    }
    final path = '/posts/${Uri.encodeComponent(postId)}/reactions';
    final response = type != null
        ? await dio.post<Map<String, dynamic>>(
            path,
            data: {'reactionType': type},
            options: _options(token, mutation: true),
          )
        : await dio.delete<Map<String, dynamic>>(
            path,
            options: _options(token, mutation: true),
          );
    if (response.data?['postId'] != postId ||
        (type != null && response.data?['reactionType'] != type) ||
        (type == null && response.data?['removed'] is! bool)) {
      throw StateError('Feedback change not confirmed');
    }
  }

  Future<void> mute(String userId, String token) async {
    final response = await dio.post<Map<String, dynamic>>(
      '/mutes',
      data: {'userId': userId},
      options: _options(token, mutation: true),
    );
    if (response.data?['userId'] != userId || response.data?['muted'] != true) {
      throw StateError('Mute not confirmed');
    }
  }
}

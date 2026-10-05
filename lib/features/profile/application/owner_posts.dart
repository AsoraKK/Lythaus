// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';

const int ownerPostsPageSize = 8;

final ownerPostsServiceProvider = Provider<OwnerPostsService>((ref) {
  return OwnerPostsService(ref.watch(secureDioProvider));
});

final ownerPostsTimelineProvider =
    AsyncNotifierProvider.autoDispose.family<
      OwnerPostsController,
      OwnerPostsTimeline,
      OwnerPostsKey
    >(OwnerPostsController.new);

class OwnerPostsService {
  OwnerPostsService(this._dio);

  final Dio _dio;

  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/users/me/posts',
      queryParameters: {
        'limit': ownerPostsPageSize,
        if (cursor != null) 'cursor': cursor,
      },
      cancelToken: cancelToken,
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
    return OwnerPostsPage.fromJson(response.data ?? const {});
  }
}

class OwnerPostsController
    extends AutoDisposeFamilyAsyncNotifier<OwnerPostsTimeline, OwnerPostsKey> {
  int _requestRevision = 0;

  @override
  Future<OwnerPostsTimeline> build(OwnerPostsKey key) async {
    final revision = ref.watch(authSessionRevisionProvider);
    final user = ref.watch(currentUserProvider);
    if (user == null || user.id != key.userId || revision != key.sessionRevision) {
      throw StateError('Sign in to view your private posts');
    }
    final page = await _fetchPage(null);
    return OwnerPostsTimeline(items: page.items, nextCursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    final requestRevision = _requestRevision;
    state = AsyncData(
      current.copyWith(isLoadingMore: true, clearLoadMoreError: true),
    );
    try {
      final page = await _fetchPage(current.nextCursor);
      if (!_sessionMatches() || requestRevision != _requestRevision) return;
      final latest = state.valueOrNull ?? current;
      state = AsyncData(latest.append(page));
    } catch (error) {
      if (!_sessionMatches() ||
          requestRevision != _requestRevision ||
          (error is DioException && CancelToken.isCancel(error))) {
        return;
      }
      final latest = state.valueOrNull;
      if (latest == null) return;
      state = AsyncData(
        latest.copyWith(isLoadingMore: false, loadMoreError: error),
      );
    }
  }

  Future<void> refresh() async {
    if (!_sessionMatches()) return;
    final requestRevision = ++_requestRevision;
    state = const AsyncLoading();
    try {
      final page = await _fetchPage(null);
      if (!_sessionMatches() || requestRevision != _requestRevision) return;
      state = AsyncData(
        OwnerPostsTimeline(items: page.items, nextCursor: page.nextCursor),
      );
    } catch (error, stackTrace) {
      if (!_sessionMatches() ||
          requestRevision != _requestRevision ||
          (error is DioException && CancelToken.isCancel(error))) {
        return;
      }
      state = AsyncError(error, stackTrace);
    }
  }

  Future<OwnerPostsPage> _fetchPage(String? cursor) async {
    final cancelToken = CancelToken();
    final session = ref.read(authSessionRevisionProvider.notifier);
    final stop = session.cancelOnChange(cancelToken.cancel);
    ref.onDispose(stop);
    ref.onDispose(cancelToken.cancel);
    try {
      final token = await Future.any<String?>([
        ref.read(jwtProvider.future),
        cancelToken.whenCancel.then<String?>((error) => throw error),
      ]);
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      if (token == null || token.isEmpty) throw StateError('Session expired');
      final page = await ref
          .read(ownerPostsServiceProvider)
          .getPage(accessToken: token, cursor: cursor, cancelToken: cancelToken);
      if (!_sessionMatches()) throw StateError('Profile session changed');
      if (page.items.any((post) => post.authorId != arg.userId)) {
        throw const FormatException('Owner posts do not match the session');
      }
      return page;
    } finally {
      stop();
    }
  }

  bool _sessionMatches() {
    try {
      return ref.read(currentUserProvider)?.id == arg.userId &&
          ref.read(authSessionRevisionProvider) == arg.sessionRevision;
    } catch (_) {
      return false;
    }
  }
}

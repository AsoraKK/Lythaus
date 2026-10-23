import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/application/owner_comments.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_comment.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

import '../../../helpers/feed_session.dart';
import '../../../golden_test_utils.dart';

class _Comments extends OwnerCommentsService {
  _Comments() : super(Dio());

  @override
  Future<OwnerCommentsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => const OwnerCommentsPage(items: [], nextCursor: null);
}

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final directory = Platform.environment['LYTHAUS_ROBUSTNESS_EVIDENCE_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

class _Posts extends OwnerPostsService {
  _Posts(this.failure) : super(Dio());

  final DioException failure;
  final cursors = <String?>[];
  bool fail = true;

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async {
    cursors.add(cursor);
    if (cursor != null && fail) throw failure;
    return OwnerPostsPage(
      items: [
        OwnerPost(
          id: cursor == null ? 'private-first' : 'private-second',
          authorId: 'owner',
          body: 'Synthetic private content',
          declaredCreationMode: 'human',
          moderationState: 'under_review',
          visibility: 'private',
          publishedAt: null,
          createdAt: DateTime.utc(2026, 10, 23),
          updatedAt: DateTime.utc(2026, 10, 23),
        ),
      ],
      nextCursor: cursor == null ? 'page-2' : null,
    );
  }
}

class _DelayedPosts extends _Posts {
  _DelayedPosts(super.failure);

  final started = Completer<void>();
  final response = Completer<OwnerPostsPage>();

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) {
    if (cursor != null) {
      cursors.add(cursor);
      started.complete();
      return response.future;
    }
    return super.getPage(
      accessToken: accessToken,
      cursor: cursor,
      cancelToken: cancelToken,
    );
  }
}

void main() {
  setUpAll(loadFontsForGoldenTests);

  for (final status in [401, 403]) {
    for (final transition in ['refresh', 'account re-entry']) {
      test(
        'late owner denial $status cannot clear posts after $transition',
        () async {
          final options = RequestOptions(path: '/api/users/me/posts');
          final failure = DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: status,
            ),
          );
          final service = _DelayedPosts(failure);
          final auth = FeedTestAuth(feedTestUser('owner'));
          final container = ProviderContainer(
            overrides: [
              authStateProvider.overrideWith((_) => auth),
              jwtProvider.overrideWith((_) async => 'synthetic-token'),
              ownerPostsServiceProvider.overrideWithValue(service),
            ],
          );
          addTearDown(container.dispose);
          final provider = ownerPostsTimelineProvider(
            OwnerPostsKey(
              userId: 'owner',
              sessionRevision: container.read(authSessionRevisionProvider),
            ),
          );
          final subscription = container.listen(provider, (_, _) {});
          addTearDown(subscription.close);
          await container.read(provider.future);
          final pending = container.read(provider.notifier).loadMore();
          await service.started.future;
          if (transition == 'refresh') {
            await container.read(provider.notifier).refresh();
          } else {
            auth.change(const AsyncData(null));
            auth.setUser(feedTestUser('owner'));
          }
          final currentProvider = ownerPostsTimelineProvider(
            OwnerPostsKey(
              userId: 'owner',
              sessionRevision: container.read(authSessionRevisionProvider),
            ),
          );
          final currentSubscription = container.listen(
            currentProvider,
            (_, _) {},
          );
          addTearDown(currentSubscription.close);
          await container.read(currentProvider.future);
          service.response.completeError(failure);
          await pending;
          final current = container.read(currentProvider);
          expect(current.hasError, isFalse);
          expect(current.requireValue.items.single.id, 'private-first');
          expect(current.requireValue.nextCursor, 'page-2');
          expect(current.requireValue.loadMoreError, isNull);
        },
      );
    }
  }

  for (final status in [401, 403]) {
    testWidgets('private cards disappear after pagination denial $status', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(
        Size(status == 401 ? 390 : 1024, 800),
      );
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final options = RequestOptions(path: '/api/users/me/posts');
      final service = _Posts(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: status,
          ),
        ),
      );
      final captureKey = GlobalKey();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith(
              (_) => FeedTestAuth(feedTestUser('owner')),
            ),
            jwtProvider.overrideWith((_) async => 'synthetic-token'),
            ownerPostsServiceProvider.overrideWithValue(service),
            ownerCommentsServiceProvider.overrideWithValue(_Comments()),
            ownerProfileProvider.overrideWith(
              (_) async => const OwnerProfile(
                user: PublicUser(
                  id: 'owner',
                  displayName: 'Synthetic owner',
                  tier: 'free',
                ),
                moderationState: 'allowed',
                publicVisibility: true,
              ),
            ),
            reputationProvider.overrideWith(
              (_) async => throw StateError('Synthetic unavailable reputation'),
            ),
          ],
          child: RepaintBoundary(
            key: captureKey,
            child: const MaterialApp(home: ProfileScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Tab, 'Posts'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic private content'), findsOneWidget);
      await _capture(tester, captureKey, 'owner-posts-$status-loaded');
      await tester.ensureVisible(find.text('Load more posts'));
      await tester.tap(find.text('Load more posts'));
      await tester.pumpAndSettle();
      await _capture(tester, captureKey, 'owner-posts-$status-denied');
      expect(find.text('Synthetic private content'), findsNothing);
      expect(find.text('Posts could not be loaded'), findsOneWidget);
      expect(find.text('Load more posts'), findsNothing);
      expect(find.text('Retry loading posts'), findsNothing);
      expect(tester.takeException(), isNull);
      service.fail = false;
      await tester.tap(find.text('Retry posts'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic private content'), findsOneWidget);
      expect(service.cursors, [null, 'page-2', null]);
    });
  }

  for (final status in [401, 403, 500, null]) {
    test('owner pagination handles access/transport failure $status', () async {
      final options = RequestOptions(path: '/api/users/me/posts');
      final failure = DioException(
        requestOptions: options,
        type: status == null
            ? DioExceptionType.connectionError
            : DioExceptionType.badResponse,
        response: status == null
            ? null
            : Response<dynamic>(requestOptions: options, statusCode: status),
      );
      final service = _Posts(failure);
      final auth = FeedTestAuth(feedTestUser('owner'));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((_) => auth),
          jwtProvider.overrideWith((_) async => 'synthetic-token'),
          ownerPostsServiceProvider.overrideWithValue(service),
        ],
      );
      addTearDown(container.dispose);
      final provider = ownerPostsTimelineProvider(
        OwnerPostsKey(
          userId: 'owner',
          sessionRevision: container.read(authSessionRevisionProvider),
        ),
      );
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await container.read(provider.future);
      expect(
        container.read(provider).requireValue.items.single.id,
        'private-first',
      );

      final notifier = container.read(provider.notifier);
      await notifier.loadMore();
      final state = container.read(provider);
      if (status == 401 || status == 403) {
        expect(state.hasError, isTrue);
        expect(state.valueOrNull?.items ?? [], isEmpty);
        expect(state.valueOrNull?.hasMore ?? false, isFalse);
        expect(state.error, same(failure));
        await notifier.loadMore();
        expect(service.cursors, [null, 'page-2']);
        service.fail = false;
        await notifier.refresh();
        expect(
          container.read(provider).requireValue.items.single.id,
          'private-first',
        );
        expect(service.cursors, [null, 'page-2', null]);
      } else {
        expect(state.requireValue.items.single.id, 'private-first');
        expect(state.requireValue.loadMoreError, same(failure));
        expect(state.requireValue.isLoadingMore, isFalse);
        service.fail = false;
        await notifier.loadMore();
        expect(
          container.read(provider).requireValue.items.map((post) => post.id),
          ['private-first', 'private-second'],
        );
        expect(service.cursors, [null, 'page-2', 'page-2']);
      }
    });
  }
}

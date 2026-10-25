import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/owner_comments.dart';
import 'package:lythaus/features/profile/domain/owner_comment.dart';

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Map<String, dynamic> _commentJson(
  String id,
  String authorId, {
  String moderationState = 'allowed',
}) => {
  'id': id,
  'authorId': authorId,
  'body': 'Synthetic $id body',
  'declaredCreationMode': 'human',
  'moderationState': moderationState,
  'postId': 'synthetic-post',
  'parentId': null,
  'depth': 0,
  'deleted': false,
  'createdAt': '2026-10-05T00:00:00Z',
  'updatedAt': '2026-10-05T00:00:00Z',
};

final _session = StateProvider<User?>((ref) => _user('owner-a'));

class _StubOwnerCommentsService extends OwnerCommentsService {
  _StubOwnerCommentsService() : super(Dio());

  final requests = <(String, String?)>[];

  @override
  Future<OwnerCommentsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async {
    requests.add((accessToken, cursor));
    final ownerId = accessToken == 'token-owner-a' ? 'owner-a' : 'owner-b';
    if (cursor == null) {
      return OwnerCommentsPage.fromJson({
        'items': [_commentJson('$ownerId-comment-1', ownerId)],
        'nextCursor': ownerId == 'owner-a' ? 'cursor-a-2' : null,
      });
    }
    return OwnerCommentsPage.fromJson({
      'items': [
        _commentJson(
          '$ownerId-comment-2',
          ownerId,
          moderationState: 'under_review',
        ),
      ],
      'nextCursor': null,
    });
  }
}

class _ControlledOwnerCommentsService extends _StubOwnerCommentsService {
  final pending = <Completer<OwnerCommentsPage>>[];
  final cancelTokens = <CancelToken?>[];

  @override
  Future<OwnerCommentsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) {
    requests.add((accessToken, cursor));
    cancelTokens.add(cancelToken);
    final response = Completer<OwnerCommentsPage>();
    pending.add(response);
    // Deliberately allow responses after cancellation to test stale-result fencing.
    return response.future;
  }
}

OwnerCommentsPage _page(String id, {String? nextCursor}) =>
    OwnerCommentsPage.fromJson({
      'items': [_commentJson(id, 'owner-a')],
      'nextCursor': nextCursor,
    });

ProviderContainer _container(_StubOwnerCommentsService service) =>
    ProviderContainer(
      overrides: [
        currentUserProvider.overrideWith((ref) => ref.watch(_session)),
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(ref.read(_session.notifier)),
        ),
        jwtProvider.overrideWith(
          (ref) async => 'token-${ref.watch(_session)?.id}',
        ),
        ownerCommentsServiceProvider.overrideWithValue(service),
      ],
    );

void main() {
  test(
    'service sends the owner collection request with token and cursor',
    () async {
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            expect(request.method, 'GET');
            expect(request.path, '/api/users/me/comments');
            expect(request.headers['Authorization'], 'Bearer synthetic-token');
            expect(request.queryParameters, {
              'limit': 8,
              'cursor': 'synthetic-cursor',
            });
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 200,
                data: {
                  'items': [_commentJson('comment', 'owner-a')],
                  'nextCursor': null,
                },
              ),
            );
          },
        ),
      );
      final page = await OwnerCommentsService(
        dio,
      ).getPage(accessToken: 'synthetic-token', cursor: 'synthetic-cursor');
      expect(page.items.single.id, 'comment');
      expect(page.nextCursor, isNull);
    },
  );

  test('malformed and unavailable comment pages fail closed', () {
    for (final changes in [
      {'deleted': true},
      {'moderationState': 'blocked'},
      {'declaredCreationMode': 'ai_generated'},
      {'depth': 1, 'parentId': null},
      {'depth': 0.0},
      {'createdAt': 'invalid'},
    ]) {
      expect(
        () => OwnerComment.fromJson({
          ..._commentJson('comment', 'owner-a'),
          ...changes,
        }),
        throwsFormatException,
      );
    }
    expect(
      () => OwnerCommentsPage.fromJson(const {'items': <Object?>[]}),
      throwsFormatException,
    );
    expect(
      () => OwnerCommentsPage.fromJson(const {
        'items': <Object?>[],
        'nextCursor': '',
      }),
      throwsFormatException,
    );
  });

  test(
    'pagination refuses repeated cursors without losing loaded comments',
    () {
      final first = OwnerCommentsTimeline(
        items: [OwnerComment.fromJson(_commentJson('first', 'owner-a'))],
        nextCursor: 'same-cursor',
      );
      expect(
        () => first.append(
          OwnerCommentsPage(
            items: [OwnerComment.fromJson(_commentJson('second', 'owner-a'))],
            nextCursor: 'same-cursor',
          ),
        ),
        throwsFormatException,
      );
      expect(first.items.single.id, 'first');
    },
  );

  test(
    'overlapping next-page calls send one request and retry after failure',
    () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(_page('first', nextCursor: 'page-2'));
      await container.read(provider.future);
      final controller = container.read(provider.notifier);
      final loading = controller.loadMore();
      await controller.loadMore();
      await Future<void>.delayed(Duration.zero);
      expect(service.pending, hasLength(2));
      service.pending[1].completeError(StateError('synthetic page failure'));
      await loading;
      expect(container.read(provider).value!.items.single.id, 'first');
      expect(container.read(provider).value!.loadMoreError, isNotNull);
      final retry = controller.loadMore();
      await Future<void>.delayed(Duration.zero);
      service.pending[2].complete(
        OwnerCommentsPage.fromJson({
          'items': [
            _commentJson('first', 'owner-a'),
            _commentJson('second', 'owner-a'),
          ],
          'nextCursor': null,
        }),
      );
      await retry;
      expect(container.read(provider).value!.items.map((item) => item.id), [
        'first',
        'second',
      ]);
      expect(container.read(provider).value!.loadMoreError, isNull);
    },
  );

  test('account switch cancels and rejects a late private response', () async {
    final service = _ControlledOwnerCommentsService();
    final container = _container(service);
    addTearDown(container.dispose);
    final provider = ownerCommentsTimelineProvider(
      const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
    );
    final subscription = container.listen(provider, (_, _) {});
    addTearDown(subscription.close);
    await Future<void>.delayed(Duration.zero);
    final initial = container.read(provider.future);
    final rejected = expectLater(initial, throwsStateError);
    container.read(_session.notifier).state = _user('owner-b');
    await container.pump();
    expect(service.cancelTokens.single!.isCancelled, isTrue);
    service.pending.single.complete(_page('late-secret'));
    await rejected;
    await container.pump();
    expect(container.read(provider).valueOrNull, isNull);
  });

  for (final status in [401, 403]) {
    test('pagination $status drops private comments and its cursor', () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(
        _page('private-first', nextCursor: 'private-cursor'),
      );
      await container.read(provider.future);
      final loading = container.read(provider.notifier).loadMore();
      await Future<void>.delayed(Duration.zero);
      final request = RequestOptions(path: '/api/users/me/comments');
      service.pending[1].completeError(
        DioException(
          requestOptions: request,
          response: Response(requestOptions: request, statusCode: status),
          type: DioExceptionType.badResponse,
        ),
      );
      await loading;
      final result = container.read(provider);
      expect(result.hasError, isTrue);
      expect(result.valueOrNull?.items ?? [], isEmpty);
      expect(result.valueOrNull?.nextCursor, isNull);
      await container.read(provider.notifier).loadMore();
      expect(service.pending, hasLength(2));
      final recovered = container.read(provider.notifier).refresh();
      await Future<void>.delayed(Duration.zero);
      expect(service.requests.last.$2, isNull);
      service.pending[2].complete(_page('fresh-after-sign-in'));
      await recovered;
      expect(
        container.read(provider).requireValue.items.single.id,
        'fresh-after-sign-in',
      );
    });
  }

  test(
    'a late pagination denial from account A cannot clear account B comments',
    () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final providerA = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subA = container.listen(providerA, (_, _) {});
      addTearDown(subA.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(
        _page('account-a-private', nextCursor: 'a-next'),
      );
      await container.read(providerA.future);
      final older = container.read(providerA.notifier).loadMore();
      await Future<void>.delayed(Duration.zero);
      container.read(_session.notifier).state = _user('owner-b');
      await container.pump();
      final providerB = ownerCommentsTimelineProvider(
        OwnerCommentsKey(
          userId: 'owner-b',
          sessionRevision: container.read(authSessionRevisionProvider),
        ),
      );
      final subB = container.listen(providerB, (_, _) {});
      addTearDown(subB.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[2].complete(
        OwnerCommentsPage.fromJson({
          'items': [_commentJson('account-b-private', 'owner-b')],
          'nextCursor': null,
        }),
      );
      await container.read(providerB.future);
      final request = RequestOptions(path: '/api/users/me/comments');
      service.pending[1].completeError(
        DioException(
          requestOptions: request,
          response: Response(requestOptions: request, statusCode: 403),
          type: DioExceptionType.badResponse,
        ),
      );
      await older;
      expect(
        container.read(providerB).requireValue.items.single.id,
        'account-b-private',
      );
      expect(container.read(providerB).hasError, false);
    },
  );

  test(
    'pagination network failure preserves harmless data and its retry cursor',
    () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(
        _page('private-first', nextCursor: 'retry-cursor'),
      );
      await container.read(provider.future);
      final loading = container.read(provider.notifier).loadMore();
      await Future<void>.delayed(Duration.zero);
      service.pending[1].completeError(
        DioException(
          requestOptions: RequestOptions(path: '/api/users/me/comments'),
          type: DioExceptionType.connectionError,
        ),
      );
      await loading;
      final result = container.read(provider).requireValue;
      expect(result.items.single.id, 'private-first');
      expect(result.nextCursor, 'retry-cursor');
      expect(result.loadMoreError, isA<DioException>());
    },
  );

  test('foreign author response fails closed', () async {
    final service = _ControlledOwnerCommentsService();
    final container = _container(service);
    addTearDown(container.dispose);
    final provider = ownerCommentsTimelineProvider(
      const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
    );
    final subscription = container.listen(provider, (_, _) {});
    addTearDown(subscription.close);
    await Future<void>.delayed(Duration.zero);
    final rejected = expectLater(
      container.read(provider.future),
      throwsFormatException,
    );
    service.pending.single.complete(
      OwnerCommentsPage.fromJson({
        'items': [_commentJson('foreign', 'owner-b')],
        'nextCursor': null,
      }),
    );
    await rejected;
    expect(container.read(provider).valueOrNull, isNull);
  });

  for (final failOlderInitial in [false, true]) {
    test(
      'refresh fences a slower initial response (error=$failOlderInitial)',
      () async {
        final service = _ControlledOwnerCommentsService();
        final container = _container(service);
        addTearDown(container.dispose);
        final provider = ownerCommentsTimelineProvider(
          const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
        );
        final subscription = container.listen(provider, (_, _) {});
        addTearDown(subscription.close);
        await Future<void>.delayed(Duration.zero);
        expect(service.pending, hasLength(1));

        final refreshed = container.read(provider.notifier).refresh();
        await Future<void>.delayed(Duration.zero);
        expect(service.pending, hasLength(2));
        expect(service.cancelTokens[0]!.isCancelled, isTrue);
        service.pending[1].complete(_page('new-refresh'));
        await refreshed;
        expect(container.read(provider).value!.items.single.id, 'new-refresh');

        if (failOlderInitial) {
          service.pending[0].completeError(
            StateError('Old initial request failed'),
          );
        } else {
          service.pending[0].complete(_page('old-initial'));
        }
        await Future<void>.delayed(Duration.zero);
        await container.pump();
        expect(container.read(provider).value!.items.single.id, 'new-refresh');
      },
    );
  }

  test('the latest of repeated refreshes wins', () async {
    final service = _ControlledOwnerCommentsService();
    final container = _container(service);
    addTearDown(container.dispose);
    final provider = ownerCommentsTimelineProvider(
      const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
    );
    final subscription = container.listen(provider, (_, _) {});
    addTearDown(subscription.close);
    await Future<void>.delayed(Duration.zero);
    service.pending[0].complete(_page('initial'));
    await container.read(provider.future);

    final controller = container.read(provider.notifier);
    final olderRefresh = controller.refresh();
    await Future<void>.delayed(Duration.zero);
    final latestRefresh = controller.refresh();
    await Future<void>.delayed(Duration.zero);
    service.pending[2].complete(_page('latest-refresh'));
    await latestRefresh;
    service.pending[1].complete(_page('older-refresh'));
    await olderRefresh;
    expect(container.read(provider).value!.items.single.id, 'latest-refresh');
  });

  for (final failOlderPage in [false, true]) {
    test('refresh fences an older page (error=$failOlderPage)', () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(_page('initial', nextCursor: 'old-page-2'));
      await container.read(provider.future);

      final controller = container.read(provider.notifier);
      final olderPage = controller.loadMore();
      await Future<void>.delayed(Duration.zero);
      final refreshed = controller.refresh();
      await Future<void>.delayed(Duration.zero);
      expect(service.pending, hasLength(3));
      expect(service.requests[1].$2, 'old-page-2');
      service.pending[2].complete(
        _page('new-refresh', nextCursor: 'new-page-2'),
      );
      await refreshed;
      if (failOlderPage) {
        service.pending[1].completeError(StateError('Old page failed'));
      } else {
        service.pending[1].complete(_page('old-page'));
      }
      await olderPage;
      final timeline = container.read(provider).value!;
      expect(timeline.items.map((comment) => comment.id), ['new-refresh']);
      expect(timeline.nextCursor, 'new-page-2');
      expect(timeline.isLoadingMore, isFalse);
      expect(timeline.loadMoreError, isNull);
    });
  }

  test(
    'disposal cancels a pending page and ignores its late response',
    () async {
      final service = _ControlledOwnerCommentsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerCommentsTimelineProvider(
        const OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0),
      );
      final subscription = container.listen(provider, (_, _) {});
      await Future<void>.delayed(Duration.zero);
      service.pending[0].complete(_page('initial', nextCursor: 'page-2'));
      await container.read(provider.future);
      final olderPage = container.read(provider.notifier).loadMore();
      await Future<void>.delayed(Duration.zero);

      subscription.close();
      await container.pump();
      expect(service.cancelTokens[1]!.isCancelled, isTrue);
      service.pending[1].complete(_page('late-page'));
      await olderPage;
      expect(container.exists(provider), isFalse);
    },
  );

  test('owner comment DTO labels review state honestly', () {
    final published = OwnerComment.fromJson(
      _commentJson('comment-1', 'owner-a'),
    );
    final pending = OwnerComment.fromJson(
      _commentJson('comment-2', 'owner-a', moderationState: 'under_review'),
    );

    expect(published.statusLabel, 'Approved');
    expect(pending.statusLabel, 'Awaiting review');
    expect(
      () => OwnerComment.fromJson(const {'id': 'incomplete'}),
      throwsFormatException,
    );
    expect(
      () => OwnerCommentsPage.fromJson(const {
        'items': 'not-a-list',
        'nextCursor': null,
      }),
      throwsFormatException,
    );
  });

  test('timeline appends pages and keeps each session isolated', () async {
    final service = _StubOwnerCommentsService();
    final container = _container(service);
    addTearDown(container.dispose);
    const ownerAKey = OwnerCommentsKey(userId: 'owner-a', sessionRevision: 0);
    final ownerAProvider = ownerCommentsTimelineProvider(ownerAKey);
    final ownerASubscription = container.listen(ownerAProvider, (_, _) {});
    addTearDown(ownerASubscription.close);

    final firstPage = await container.read(ownerAProvider.future);
    expect(firstPage.items.map((comment) => comment.id), const [
      'owner-a-comment-1',
    ]);
    expect(firstPage.hasMore, isTrue);
    await container.read(ownerAProvider.notifier).loadMore();
    final completeTimeline = container.read(ownerAProvider).value!;
    expect(completeTimeline.items.map((comment) => comment.id), const [
      'owner-a-comment-1',
      'owner-a-comment-2',
    ]);
    expect(completeTimeline.items.last.statusLabel, 'Awaiting review');
    expect(completeTimeline.hasMore, isFalse);
    expect(service.requests, [
      ('token-owner-a', null),
      ('token-owner-a', 'cursor-a-2'),
    ]);

    ownerASubscription.close();
    await container.pump();
    container.read(_session.notifier).state = _user('owner-b');
    await container.pump();
    expect(container.read(authSessionRevisionProvider), 1);
    await expectLater(container.read(ownerAProvider.future), throwsStateError);
    expect(container.read(ownerAProvider).valueOrNull, isNull);

    const ownerBKey = OwnerCommentsKey(userId: 'owner-b', sessionRevision: 1);
    final ownerBProvider = ownerCommentsTimelineProvider(ownerBKey);
    final ownerBSubscription = container.listen(ownerBProvider, (_, _) {});
    addTearDown(ownerBSubscription.close);
    final ownerBTimeline = await container.read(ownerBProvider.future);
    expect(ownerBTimeline.items.map((comment) => comment.id), [
      'owner-b-comment-1',
    ]);
    expect(
      ownerBTimeline.items.every((comment) => comment.authorId == 'owner-b'),
      isTrue,
    );
    expect(service.requests.last, ('token-owner-b', null));
  });
}

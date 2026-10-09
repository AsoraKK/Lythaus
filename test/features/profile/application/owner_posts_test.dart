import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Map<String, dynamic> _postJson(
  String id,
  String authorId, {
  String moderationState = 'allowed',
  String visibility = 'public',
  String? publishedAt = '2026-10-05T00:00:00Z',
}) => {
  'id': id,
  'authorId': authorId,
  'body': 'Synthetic $id body',
  'declaredCreationMode': 'human',
  'moderationState': moderationState,
  'visibility': visibility,
  'publishedAt': publishedAt,
  'createdAt': '2026-10-05T00:00:00Z',
  'updatedAt': '2026-10-05T00:00:00Z',
};

final _session = StateProvider<User?>((ref) => _user('owner-a'));

class _StubOwnerPostsService extends OwnerPostsService {
  _StubOwnerPostsService() : super(Dio());

  final requests = <(String, String?)>[];

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async {
    requests.add((accessToken, cursor));
    final ownerId = accessToken == 'token-owner-a' ? 'owner-a' : 'owner-b';
    if (cursor == null) {
      return OwnerPostsPage.fromJson({
        'items': [_postJson('$ownerId-post-1', ownerId)],
        'nextCursor': ownerId == 'owner-a' ? 'cursor-a-2' : null,
      });
    }
    return OwnerPostsPage.fromJson({
      'items': [
        _postJson(
          '$ownerId-post-2',
          ownerId,
          moderationState: 'under_review',
          visibility: 'private',
          publishedAt: null,
        ),
      ],
      'nextCursor': null,
    });
  }
}

class _ControlledOwnerPostsService extends _StubOwnerPostsService {
  final pending = <Completer<OwnerPostsPage>>[];
  final cancelTokens = <CancelToken?>[];

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) {
    requests.add((accessToken, cursor));
    cancelTokens.add(cancelToken);
    final response = Completer<OwnerPostsPage>();
    pending.add(response);
    // Deliberately allow responses after cancellation to test stale-result fencing.
    return response.future;
  }
}

OwnerPostsPage _page(String id, {String? nextCursor}) =>
    OwnerPostsPage.fromJson({
      'items': [_postJson(id, 'owner-a')],
      'nextCursor': nextCursor,
    });

ProviderContainer _container(_StubOwnerPostsService service) =>
    ProviderContainer(
      overrides: [
        currentUserProvider.overrideWith((ref) => ref.watch(_session)),
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(ref.read(_session.notifier)),
        ),
        jwtProvider.overrideWith(
          (ref) async => 'token-${ref.watch(_session)?.id}',
        ),
        ownerPostsServiceProvider.overrideWithValue(service),
      ],
    );

void main() {
  for (final failOlderInitial in [false, true]) {
    test(
      'refresh fences a slower initial response (error=$failOlderInitial)',
      () async {
        final service = _ControlledOwnerPostsService();
        final container = _container(service);
        addTearDown(container.dispose);
        final provider = ownerPostsTimelineProvider(
          const OwnerPostsKey(userId: 'owner-a', sessionRevision: 0),
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
    final service = _ControlledOwnerPostsService();
    final container = _container(service);
    addTearDown(container.dispose);
    final provider = ownerPostsTimelineProvider(
      const OwnerPostsKey(userId: 'owner-a', sessionRevision: 0),
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
      final service = _ControlledOwnerPostsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerPostsTimelineProvider(
        const OwnerPostsKey(userId: 'owner-a', sessionRevision: 0),
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
      expect(timeline.items.map((post) => post.id), ['new-refresh']);
      expect(timeline.nextCursor, 'new-page-2');
      expect(timeline.isLoadingMore, isFalse);
      expect(timeline.loadMoreError, isNull);
    });
  }

  test(
    'disposal cancels a pending page and ignores its late response',
    () async {
      final service = _ControlledOwnerPostsService();
      final container = _container(service);
      addTearDown(container.dispose);
      final provider = ownerPostsTimelineProvider(
        const OwnerPostsKey(userId: 'owner-a', sessionRevision: 0),
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

  test('owner post DTO labels published and pending visibility honestly', () {
    final published = OwnerPost.fromJson(
      _postJson('post-1', 'owner-a', visibility: 'followers'),
    );
    final pending = OwnerPost.fromJson(
      _postJson(
        'post-2',
        'owner-a',
        moderationState: 'under_review',
        visibility: 'private',
        publishedAt: null,
      ),
    );
    final approvedFollowerPostNotPublished = OwnerPost.fromJson(
      _postJson(
        'post-3',
        'owner-a',
        visibility: 'followers',
        publishedAt: null,
      ),
    );

    expect(published.statusLabel, 'Followers only');
    expect(pending.statusLabel, 'Awaiting review');
    expect(approvedFollowerPostNotPublished.statusLabel, 'Approved');
    expect(
      () => OwnerPost.fromJson(const {'id': 'incomplete'}),
      throwsFormatException,
    );
    expect(
      () => OwnerPostsPage.fromJson(const {
        'items': 'not-a-list',
        'nextCursor': null,
      }),
      throwsFormatException,
    );
  });

  test(
    'timeline appends pages, refreshes, and keeps each session isolated',
    () async {
      final service = _StubOwnerPostsService();
      final container = _container(service);
      addTearDown(container.dispose);
      const ownerAKey = OwnerPostsKey(userId: 'owner-a', sessionRevision: 0);
      final ownerAProvider = ownerPostsTimelineProvider(ownerAKey);
      final ownerASubscription = container.listen(ownerAProvider, (_, _) {});
      addTearDown(ownerASubscription.close);

      final firstPage = await container.read(ownerAProvider.future);
      expect(firstPage.items.map((post) => post.id), const ['owner-a-post-1']);
      expect(firstPage.hasMore, isTrue);
      await container.read(ownerAProvider.notifier).loadMore();
      final completeTimeline = container.read(ownerAProvider).value!;
      expect(completeTimeline.items.map((post) => post.id), const [
        'owner-a-post-1',
        'owner-a-post-2',
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
      await expectLater(
        container.read(ownerAProvider.future),
        throwsStateError,
      );
      expect(container.read(ownerAProvider).valueOrNull, isNull);

      const ownerBKey = OwnerPostsKey(userId: 'owner-b', sessionRevision: 1);
      final ownerBProvider = ownerPostsTimelineProvider(ownerBKey);
      final ownerBSubscription = container.listen(ownerBProvider, (_, _) {});
      addTearDown(ownerBSubscription.close);
      final ownerBTimeline = await container.read(ownerBProvider.future);
      expect(ownerBTimeline.items.map((post) => post.id), ['owner-b-post-1']);
      expect(
        ownerBTimeline.items.every((post) => post.authorId == 'owner-b'),
        isTrue,
      );
      expect(service.requests.last, ('token-owner-b', null));
    },
  );
}

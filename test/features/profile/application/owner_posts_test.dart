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

ProviderContainer _container(_StubOwnerPostsService service) => ProviderContainer(
  overrides: [
    currentUserProvider.overrideWith((ref) => ref.watch(_session)),
    authSessionRevisionProvider.overrideWith(
      (ref) => AuthSessionRevision(ref.read(_session.notifier)),
    ),
    jwtProvider.overrideWith((ref) async => 'token-${ref.watch(_session)?.id}'),
    ownerPostsServiceProvider.overrideWithValue(service),
  ],
);

void main() {
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

    expect(published.statusLabel, 'Followers only');
    expect(pending.statusLabel, 'Awaiting review');
    expect(
      () => OwnerPost.fromJson(const {'id': 'incomplete'}),
      throwsFormatException,
    );
    expect(
      () => OwnerPostsPage.fromJson(
        const {'items': 'not-a-list', 'nextCursor': null},
      ),
      throwsFormatException,
    );
  });

  test('timeline appends pages, refreshes, and keeps each session isolated', () async {
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
    expect(
      completeTimeline.items.map((post) => post.id),
      const ['owner-a-post-1', 'owner-a-post-2'],
    );
    expect(completeTimeline.items.last.statusLabel, 'Awaiting review');
    expect(completeTimeline.hasMore, isFalse);
    expect(service.requests, [
      ('token-owner-a', null),
      ('token-owner-a', 'cursor-a-2'),
    ]);

    container.read(_session.notifier).state = _user('owner-b');
    const ownerBKey = OwnerPostsKey(userId: 'owner-b', sessionRevision: 1);
    final ownerBProvider = ownerPostsTimelineProvider(ownerBKey);
    final ownerBSubscription = container.listen(ownerBProvider, (_, _) {});
    addTearDown(ownerBSubscription.close);
    final ownerBTimeline = await container.read(ownerBProvider.future);
    expect(ownerBTimeline.items.map((post) => post.id), ['owner-b-post-1']);
    expect(ownerBTimeline.items.every((post) => post.authorId == 'owner-b'), isTrue);
    expect(service.requests.last, ('token-owner-b', null));
  });
}

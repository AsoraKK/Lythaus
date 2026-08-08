import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';

class _FakeDeviceSecurityService implements DeviceSecurityService {
  _FakeDeviceSecurityService(this._state);

  final DeviceSecurityState _state;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

class _FakeFeedService implements SocialFeedRepository {
  _FakeFeedService(this.post);

  final Post post;
  bool likeCalled = false;
  bool dislikeCalled = false;
  bool flagCalled = false;

  @override
  Future<Post> getPost({required String postId, String? token}) async => post;

  @override
  Future<Post> likePost({
    required String postId,
    required bool isLike,
    required String token,
  }) async {
    likeCalled = true;
    return post;
  }

  @override
  Future<Post> dislikePost({
    required String postId,
    required bool isDislike,
    required String token,
  }) async {
    dislikeCalled = true;
    return post;
  }

  @override
  Future<void> flagPost({
    required String postId,
    required String reason,
    String? details,
    required String token,
  }) async {
    flagCalled = true;
  }

  @override
  Future<FeedResponse> getFeed({required FeedParams params, String? token}) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getUserFeed({
    required String userId,
    String? cursor,
    int limit = 25,
    String? token,
    bool includeReplies = false,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getTrendingFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getLocalFeed({
    required String location,
    double? radius,
    int page = 1,
    int pageSize = 20,
    String? token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getNewCreatorsFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<FeedResponse> getFollowingFeed({
    int page = 1,
    int pageSize = 20,
    required String token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<List<Comment>> getComments({
    required String postId,
    int page = 1,
    int pageSize = 50,
    String? token,
  }) {
    throw UnimplementedError();
  }
}

DeviceIntegrityGuard _guardFor(DeviceSecurityState state) {
  return DeviceIntegrityGuard(
    deviceSecurityService: _FakeDeviceSecurityService(state),
    config: const MobileSecurityConfig(
      tlsPins: TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      ),
      strictDeviceIntegrity: true,
      blockRootedDevices: true,
      allowRootedInPreviewForQa: false,
    ),
    environment: Environment.production,
  );
}

Post _fakePost() {
  return Post(
    id: 'post-1',
    authorId: 'author-1',
    authorUsername: 'tester',
    text: 'hello',
    createdAt: DateTime(2025, 1, 1),
  );
}

void main() {
  test('blocks like/unlike on compromised devices', () async {
    final compromised = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final service = _FakeFeedService(_fakePost());
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(compromised)),
        socialFeedServiceProvider.overrideWithValue(service),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(postProvider('post-1').future);
    final notifier = container.read(postProvider('post-1').notifier);

    await expectLater(
      notifier.toggleLike(),
      throwsA(
        isA<SocialFeedException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
    );

    expect(service.likeCalled, isFalse);
  });

  test('allows like/unlike on clean devices', () async {
    final clean = DeviceSecurityState(
      isRootedOrJailbroken: false,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final service = _FakeFeedService(_fakePost());
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(clean)),
        socialFeedServiceProvider.overrideWithValue(service),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(postProvider('post-1').future);
    final notifier = container.read(postProvider('post-1').notifier);

    await notifier.toggleLike();

    expect(service.likeCalled, isTrue);
  });

  test('blocks flagging on compromised devices', () async {
    final compromised = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final service = _FakeFeedService(_fakePost());
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(compromised)),
        socialFeedServiceProvider.overrideWithValue(service),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(postProvider('post-1').future);
    final notifier = container.read(postProvider('post-1').notifier);

    await expectLater(
      notifier.flagPost(reason: 'spam'),
      throwsA(
        isA<SocialFeedException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
    );

    expect(service.flagCalled, isFalse);
  });
}

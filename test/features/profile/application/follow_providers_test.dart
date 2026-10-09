import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockFollowService extends Mock implements FollowService {}

final _session = StateProvider<User?>((ref) => _owner('owner-a'));

User _owner(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

void main() {
  setUpAll(() => registerFallbackValue(CancelToken()));

  test('followStatusProvider throws when token is missing', () async {
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(_owner('owner-a')),
        jwtProvider.overrideWith((ref) async => null),
        followServiceProvider.overrideWith((ref) => MockFollowService()),
      ],
    );
    addTearDown(container.dispose);
    final provider = followStatusProvider('u1');
    final subscription = container.listen(provider, (_, _) {});
    addTearDown(subscription.close);

    await expectLater(
      container.read(provider.future),
      throwsA(isA<Exception>()),
    );
  });

  test('followStatusProvider returns status when token exists', () async {
    final service = MockFollowService();
    when(
      () => service.getStatus(
        targetUserId: 'u1',
        accessToken: 'token',
        cancelToken: any(named: 'cancelToken'),
      ),
    ).thenAnswer(
      (_) async => const FollowStatus(following: true, followedBy: true),
    );

    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(_owner('owner-a')),
        jwtProvider.overrideWith((ref) async => 'token'),
        followServiceProvider.overrideWith((ref) => service),
      ],
    );
    addTearDown(container.dispose);
    final provider = followStatusProvider('u1');
    final subscription = container.listen(provider, (_, _) {});
    addTearDown(subscription.close);

    final status = await container.read(provider.future);
    expect(status.following, isTrue);
    expect(status.followedBy, isTrue);
  });

  test(
    'follow status cache is rebound when the signed-in account changes',
    () async {
      final service = MockFollowService();
      when(
        () => service.getStatus(
          targetUserId: 'target',
          accessToken: 'token-owner-a',
          cancelToken: any(named: 'cancelToken'),
        ),
      ).thenAnswer((_) async => const FollowStatus(following: true));
      when(
        () => service.getStatus(
          targetUserId: 'target',
          accessToken: 'token-owner-b',
          cancelToken: any(named: 'cancelToken'),
        ),
      ).thenAnswer((_) async => const FollowStatus(following: false));

      final container = ProviderContainer(
        overrides: [
          currentUserProvider.overrideWith((ref) => ref.watch(_session)),
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(ref.read(_session.notifier)),
          ),
          jwtProvider.overrideWith(
            (ref) async => 'token-${ref.watch(_session)?.id}',
          ),
          followServiceProvider.overrideWith((ref) => service),
        ],
      );
      addTearDown(container.dispose);
      final provider = followStatusProvider('target');
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);

      expect((await container.read(provider.future)).following, isTrue);
      container.read(_session.notifier).state = _owner('owner-b');
      expect((await container.read(provider.future)).following, isFalse);
    },
  );
}

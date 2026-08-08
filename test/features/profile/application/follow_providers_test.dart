import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockFollowService extends Mock implements FollowService {}

void main() {
  test('followStatusProvider throws when token is missing', () async {
    final container = ProviderContainer(
      overrides: [
        jwtProvider.overrideWith((ref) async => null),
        followServiceProvider.overrideWith((ref) => MockFollowService()),
      ],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(followStatusProvider('u1').future),
      throwsA(isA<Exception>()),
    );
  });

  test('followStatusProvider returns status when token exists', () async {
    final service = MockFollowService();
    when(
      () => service.getStatus(targetUserId: 'u1', accessToken: 'token'),
    ).thenAnswer(
      (_) async => const FollowStatus(following: true, followerCount: 9),
    );

    final container = ProviderContainer(
      overrides: [
        jwtProvider.overrideWith((ref) async => 'token'),
        followServiceProvider.overrideWith((ref) => service),
      ],
    );
    addTearDown(container.dispose);

    final status = await container.read(followStatusProvider('u1').future);
    expect(status.following, isTrue);
    expect(status.followerCount, 9);
  });
}

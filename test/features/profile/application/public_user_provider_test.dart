import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
    registerFallbackValue(Options());
  });

  test('publicUserProvider returns profile data', () async {
    final dio = MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/users/u1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {
          'user': {
            'id': 'u1',
            'displayName': 'Tester',
            'handle': '@tester',
            'tier': 'gold',
            'trustPassportVisibility': 'public_expanded',
            'reputationScore': 42,
            'journalistVerified': true,
            'badges': ['Founder'],
          },
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/users/u1'),
      ),
    );

    final container = ProviderContainer(
      overrides: [
        secureDioProvider.overrideWithValue(dio),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    final result = await container.read(publicUserProvider('u1').future);
    expect(result, isA<PublicUser>());
    expect(result.displayName, 'Tester');
    expect(result.handleLabel, '@tester');
    expect(result.trustPassportVisibility, 'public_expanded');
  });

  test('publicUserProvider allows guest profile reads', () async {
    final dio = MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/users/u1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {
          'user': {'id': 'u1', 'displayName': 'Guest Visible', 'tier': 'free'},
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/users/u1'),
      ),
    );

    final container = ProviderContainer(
      overrides: [
        secureDioProvider.overrideWithValue(dio),
        jwtProvider.overrideWith((ref) async => null),
      ],
    );
    addTearDown(container.dispose);

    final result = await container.read(publicUserProvider('u1').future);
    expect(result.displayName, 'Guest Visible');
  });

  test('publicUserProvider throws on invalid response', () async {
    final dio = MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/users/u1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {'user': 'invalid'},
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/users/u1'),
      ),
    );

    final container = ProviderContainer(
      overrides: [
        secureDioProvider.overrideWithValue(dio),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(publicUserProvider('u1').future),
      throwsA(isA<Exception>()),
    );
  });
}

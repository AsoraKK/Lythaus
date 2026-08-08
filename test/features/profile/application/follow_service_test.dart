import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Map<String, dynamic> data,
  String path,
) {
  return Response<Map<String, dynamic>>(
    data: data,
    statusCode: 200,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  test('getStatus returns follow status', () async {
    final dio = MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/users/u1/follow',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': true,
        'followerCount': 12,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final status = await service.getStatus(
      targetUserId: 'u1',
      accessToken: 'token',
    );

    expect(status.following, isTrue);
    expect(status.followerCount, 12);
  });

  test('follow posts follow request', () async {
    final dio = MockDio();
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/users/u1/follow',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': true,
        'followerCount': 1,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final status = await service.follow(
      targetUserId: 'u1',
      accessToken: 'token',
    );

    expect(status.following, isTrue);
    expect(status.followerCount, 1);
  });

  test('unfollow deletes follow request', () async {
    final dio = MockDio();
    when(
      () => dio.delete<Map<String, dynamic>>(
        '/api/users/u1/follow',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': false,
        'followerCount': 0,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final status = await service.unfollow(
      targetUserId: 'u1',
      accessToken: 'token',
    );

    expect(status.following, isFalse);
    expect(status.followerCount, 0);
  });
}

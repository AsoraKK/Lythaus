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
    registerFallbackValue(CancelToken());
  });

  test('getStatus returns follow status', () async {
    final dio = MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/users/u1/follow',
        cancelToken: null,
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': true,
        'followedBy': true,
        'blocked': false,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final status = await service.getStatus(
      targetUserId: 'u1',
      accessToken: 'token',
    );

    expect(status.following, isTrue);
    expect(status.followedBy, isTrue);
    expect(status.blocked, isFalse);
  });

  test('follow posts follow request', () async {
    final dio = MockDio();
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/users/u1/follow',
        cancelToken: null,
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': 'u1',
        'created': true,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final result = await service.follow(
      targetUserId: 'u1',
      accessToken: 'token',
      idempotencyKey: 'follow-create-key',
    );

    expect(result.targetUserId, 'u1');
    expect(result.created, isTrue);
    final options = verify(
      () => dio.post<Map<String, dynamic>>(
        '/api/users/u1/follow',
        cancelToken: null,
        options: captureAny(named: 'options'),
      ),
    ).captured.single as Options;
    expect(options.headers?['Idempotency-Key'], 'follow-create-key');
  });

  test('unfollow deletes follow request', () async {
    final dio = MockDio();
    when(
      () => dio.delete<Map<String, dynamic>>(
        '/api/users/u1/follow',
        cancelToken: null,
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'following': 'u1',
        'removed': true,
      }, '/api/users/u1/follow'),
    );

    final service = FollowService(dio);
    final result = await service.unfollow(
      targetUserId: 'u1',
      accessToken: 'token',
      idempotencyKey: 'follow-remove-key',
    );

    expect(result.targetUserId, 'u1');
    expect(result.removed, isTrue);
  });
}

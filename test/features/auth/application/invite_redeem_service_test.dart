import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  test('redeemInvite posts invite code with auth header', () async {
    final dio = MockDio();
    Options? capturedOptions;

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/auth/redeem-invite',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((invocation) async {
      capturedOptions = invocation.namedArguments[#options] as Options?;
      return Response<Map<String, dynamic>>(
        data: const {},
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/auth/redeem-invite'),
      );
    });

    final service = InviteRedeemService(dio);
    await service.redeemInvite(accessToken: 'token', inviteCode: 'CODE');

    expect(capturedOptions?.headers?['Authorization'], 'Bearer token');
    verify(
      () => dio.post<Map<String, dynamic>>(
        '/api/auth/redeem-invite',
        data: {'inviteCode': 'CODE'},
        options: any(named: 'options'),
      ),
    ).called(1);
  });
}

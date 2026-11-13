import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  test(
    'invite signup posts email, code and password to public verification',
    () async {
      final dio = MockDio();
      Options? capturedOptions;

      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/auth/email/verify',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((invocation) async {
        capturedOptions = invocation.namedArguments[#options] as Options?;
        return Response<Map<String, dynamic>>(
          data: const {'state': 'verified'},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/auth/email/verify'),
        );
      });

      final service = InviteRedeemService(dio);
      await service.redeemInvite(
        email: 'member@example.com',
        inviteCode: 'CODE',
        password: 'long-enough-password',
      );

      expect(capturedOptions?.headers?['Authorization'], isNull);
      verify(
        () => dio.post<Map<String, dynamic>>(
          '/api/auth/email/verify',
          data: {
            'email': 'member@example.com',
            'token': 'CODE',
            'password': 'long-enough-password',
          },
          options: any(named: 'options'),
        ),
      ).called(1);
    },
  );
}

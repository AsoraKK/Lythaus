// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';

class InviteRedeemService {
  InviteRedeemService(this._dio);

  final Dio _dio;

  Future<void> redeemInvite({
    required String email,
    required String inviteCode,
    required String password,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/api/auth/email/verify',
      data: {'email': email, 'token': inviteCode, 'password': password},
    );
  }
}

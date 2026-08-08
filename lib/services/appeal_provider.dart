// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

final appealProvider = Provider<AppealService>((ref) => AppealService(ref));

class AppealService {
  final Ref ref;
  AppealService(this.ref);
  Future<bool> submit(String caseId, String statement) async {
    try {
      final token = await ref.read(jwtProvider.future);
      if (token == null) return false;

      final dio = ref.read(secureDioProvider);
      await dio.post<void>(
        '/appeals',
        data: {'caseId': caseId, 'statement': statement},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}

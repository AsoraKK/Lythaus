// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/trust_passport.dart';

const Set<String> _trustPassportVisibilityValues = {
  'public_expanded',
  'public_minimal',
  'private',
};

class ProfilePreferencesService {
  ProfilePreferencesService(this._dio);

  final Dio _dio;

  Future<void> updateTrustPassportVisibility({
    required String accessToken,
    required String visibility,
  }) async {
    if (!_trustPassportVisibilityValues.contains(visibility)) {
      throw ArgumentError.value(
        visibility,
        'visibility',
        'Unsupported trust passport visibility value',
      );
    }

    await _dio.patch<Map<String, dynamic>>(
      '/api/users/me',
      data: {'trustPassportVisibility': visibility},
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
  }
}

final profilePreferencesServiceProvider = Provider<ProfilePreferencesService>((
  ref,
) {
  return ProfilePreferencesService(ref.watch(secureDioProvider));
});

/// Provider that fetches a public profile via `/api/users/{id}`.
final publicUserProvider = FutureProvider.autoDispose
    .family<PublicUser, String>((ref, userId) async {
      final dio = ref.watch(secureDioProvider);
      final token = await ref.watch(jwtProvider.future);
      final authHeader = (token != null && token.isNotEmpty)
          ? {'Authorization': 'Bearer $token'}
          : null;

      final response = await dio.get<Map<String, dynamic>>(
        '/api/users/$userId',
        options: authHeader == null ? null : Options(headers: authHeader),
      );

      final data = response.data;
      if (data == null) {
        throw Exception('Invalid profile response');
      }
      final userJson = data['user'];
      if (userJson is! Map) {
        throw Exception('Invalid profile response');
      }
      return PublicUser.fromJson(Map<String, dynamic>.from(userJson));
    });

final trustPassportProvider = FutureProvider.autoDispose
    .family<TrustPassport, String>((ref, userId) async {
      final dio = ref.watch(secureDioProvider);
      final token = await ref.watch(jwtProvider.future);
      final authHeader = (token != null && token.isNotEmpty)
          ? {'Authorization': 'Bearer $token'}
          : null;

      final response = await dio.get<Map<String, dynamic>>(
        '/api/users/$userId/trust-passport',
        options: authHeader == null ? null : Options(headers: authHeader),
      );

      final data = response.data;
      if (data == null) {
        throw Exception('Invalid trust passport response');
      }

      final payload = data['data'];
      if (payload is Map<String, dynamic>) {
        return TrustPassport.fromJson(payload);
      }
      if (payload is Map) {
        return TrustPassport.fromJson(Map<String, dynamic>.from(payload));
      }
      return TrustPassport.fromJson(data);
    });

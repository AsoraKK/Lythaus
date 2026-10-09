// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';
import 'package:lythaus/features/profile/domain/trust_passport.dart';

const Set<String> _trustPassportVisibilityValues = {
  'public_expanded',
  'public_minimal',
  'private',
};

final ownerProfileProvider = FutureProvider.autoDispose<OwnerProfile>((
  ref,
) async {
  ref.watch(authSessionRevisionProvider);
  final session = ref.read(authSessionRevisionProvider.notifier);
  final user = ref.watch(currentUserProvider);
  if (user == null) throw StateError('Sign in to view your private profile');
  final dio = ref.watch(secureDioProvider);
  final cancelToken = CancelToken();
  final stop = session.cancelOnChange(cancelToken.cancel);
  ref.onDispose(stop);
  ref.onDispose(cancelToken.cancel);
  final token = await Future.any<String?>([
    ref.watch(jwtProvider.future),
    cancelToken.whenCancel.then<String?>((error) => throw error),
  ]);
  if (cancelToken.isCancelled) throw cancelToken.cancelError!;
  if (token == null || token.isEmpty) throw StateError('Session expired');
  final response = await dio.get<Map<String, dynamic>>(
    '/api/users/me',
    cancelToken: cancelToken,
    options: Options(headers: {'Authorization': 'Bearer $token'}),
  );
  final profile = OwnerProfile.fromJson(response.data ?? const {});
  if (cancelToken.isCancelled) throw cancelToken.cancelError!;
  if (profile.user.id != user.id) {
    throw const FormatException('Owner profile does not match the session');
  }
  return profile;
});

class ProfilePreferencesService {
  ProfilePreferencesService(this._dio);

  final Dio _dio;

  Future<OwnerProfile> updatePresentationPreferences({
    required String accessToken,
    required PresentationPreferences preferences,
    required String idempotencyKey,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/api/users/me',
      data: {
        'presentationPreferences': {
          'leftHandedMode': preferences.leftHandedMode,
          'horizontalSwipeEnabled': preferences.horizontalSwipeEnabled,
          'expectedVersion': preferences.version,
        },
      },
      cancelToken: cancelToken,
      options: Options(
        headers: {
          'Authorization': 'Bearer $accessToken',
          'Idempotency-Key': idempotencyKey,
        },
      ),
    );
    return OwnerProfile.fromJson(response.data ?? const {});
  }

  Future<OwnerProfile> updateTrustPassportVisibility({
    required String accessToken,
    required String visibility,
    CancelToken? cancelToken,
  }) async {
    if (!_trustPassportVisibilityValues.contains(visibility)) {
      throw ArgumentError.value(
        visibility,
        'visibility',
        'Unsupported trust passport visibility value',
      );
    }

    final response = await _dio.patch<Map<String, dynamic>>(
      '/api/users/me',
      data: {'trustPassportVisibility': visibility},
      cancelToken: cancelToken,
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
    return OwnerProfile.fromJson(response.data ?? const {});
  }
}

void invalidateOwnerProfileProjections(WidgetRef ref, String userId) {
  if (ref.read(currentUserProvider)?.id != userId) return;
  ref.invalidate(ownerProfileProvider);
  ref.invalidate(publicUserProvider(userId));
  ref.invalidate(trustPassportProvider(userId));
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
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final token = await ref.watch(jwtProvider.future);
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final authHeader = (token != null && token.isNotEmpty)
          ? {'Authorization': 'Bearer $token'}
          : null;

      final response = await dio.get<Map<String, dynamic>>(
        '/api/users/$userId',
        cancelToken: cancelToken,
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
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final token = await ref.watch(jwtProvider.future);
      if (cancelToken.isCancelled) throw cancelToken.cancelError!;
      final authHeader = (token != null && token.isNotEmpty)
          ? {'Authorization': 'Bearer $token'}
          : null;

      final response = await dio.get<Map<String, dynamic>>(
        '/api/users/$userId/trust-passport',
        cancelToken: cancelToken,
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

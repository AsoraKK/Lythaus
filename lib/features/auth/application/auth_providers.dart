// ignore_for_file: public_member_api_docs

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/user.dart';

final enhancedAuthServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    secureStorage: const FlutterSecureStorage(),
    httpClient: http.Client(),
  );
});

final inviteRedeemServiceProvider = Provider<InviteRedeemService>((ref) {
  return InviteRedeemService(ref.watch(secureDioProvider));
});

final tokenVersionProvider = StateProvider<int>((ref) => 0);
final guestModeProvider = StateProvider<bool>((ref) => false);
final pendingInviteCodeProvider = StateProvider<String?>((ref) => null);

final authStateProvider =
    StateNotifierProvider<AuthStateNotifier, AsyncValue<User?>>((ref) {
      return AuthStateNotifier(ref, ref.read(enhancedAuthServiceProvider));
    });

class AuthStateNotifier extends StateNotifier<AsyncValue<User?>> {
  AuthStateNotifier(this._ref, this._authService)
    : super(const AsyncValue.loading()) {
    _loadCurrentUser();
  }

  final Ref _ref;
  final AuthService _authService;

  void _bumpTokenVersion() {
    final notifier = _ref.read(tokenVersionProvider.notifier);
    notifier.state = notifier.state + 1;
  }

  void setUser(User user) {
    _ref.read(guestModeProvider.notifier).state = false;
    state = AsyncValue.data(user);
    _bumpTokenVersion();
  }

  Future<void> _loadCurrentUser() async {
    try {
      state = AsyncValue.data(await _authService.getCurrentUser());
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    }
  }

  Future<void> signInWithEmail(String email, String password) async {
    try {
      _ref.read(guestModeProvider.notifier).state = false;
      state = const AsyncValue.loading();
      final user = await _authService.loginWithEmail(email, password);
      state = AsyncValue.data(user);
      _bumpTokenVersion();
    } on AuthFailure catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    } catch (error, stackTrace) {
      state = AsyncValue.error(
        AuthFailure.serverError('Email sign-in failed: ${error.toString()}'),
        stackTrace,
      );
    }
  }

  Future<void> refreshToken() async {
    try {
      if (!await _authService.refreshSession()) {
        throw AuthFailure.invalidCredentials('Session expired');
      }
      _bumpTokenVersion();
    } on AuthFailure catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    } catch (error, stackTrace) {
      state = AsyncValue.error(
        AuthFailure.serverError('Token refresh failed: ${error.toString()}'),
        stackTrace,
      );
    }
  }

  Future<void> signOut() async {
    _ref.read(guestModeProvider.notifier).state = false;
    try {
      await _authService.logout();
    } finally {
      state = const AsyncValue.data(null);
      _bumpTokenVersion();
    }
  }

  Future<void> continueAsGuest() async {
    try {
      await _authService.logout();
    } catch (_) {
      // Guest mode remains available when remote logout is unavailable.
    }
    _ref.read(guestModeProvider.notifier).state = true;
    state = const AsyncValue.data(null);
    _bumpTokenVersion();
  }

  Future<void> validateToken() async {
    try {
      if (!await _authService.validateAndRefreshToken()) {
        state = const AsyncValue.data(null);
      } else {
        state = AsyncValue.data(await _authService.getCurrentUser());
      }
      _bumpTokenVersion();
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    }
  }
}

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).valueOrNull != null;
});

final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).valueOrNull;
});

final isAuthLoadingProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isLoading;
});

final authErrorProvider = Provider<AuthFailure?>((ref) {
  final state = ref.watch(authStateProvider);
  return state.hasError && state.error is AuthFailure
      ? state.error! as AuthFailure
      : null;
});

final jwtProvider = FutureProvider<String?>((ref) async {
  ref.watch(tokenVersionProvider);
  final token = await ref.watch(enhancedAuthServiceProvider).getJwtToken();
  return token == null || token.isEmpty ? null : token;
});

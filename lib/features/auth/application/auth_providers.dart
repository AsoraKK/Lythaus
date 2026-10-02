// ignore_for_file: public_member_api_docs

library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/application/session_platform.dart';
import 'package:lythaus/features/auth/application/invite_redeem_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/user.dart';

final enhancedAuthServiceProvider = Provider<AuthService>((ref) {
  return AuthService(secureStorage: const FlutterSecureStorage());
});

final inviteRedeemServiceProvider = Provider<InviteRedeemService>((ref) {
  return InviteRedeemService(ref.watch(secureDioProvider));
});

final tokenVersionProvider = StateProvider<int>((ref) => 0);
final guestModeProvider = StateProvider<bool>((ref) => false);
final pendingInviteCodeProvider = StateProvider<String?>((ref) => null);
final profileSetupRequestedProvider = StateProvider<bool>((ref) => false);

final authStateProvider =
    StateNotifierProvider<AuthStateNotifier, AsyncValue<User?>>((ref) {
      return AuthStateNotifier(ref, ref.read(enhancedAuthServiceProvider));
    });

class AuthStateNotifier extends StateNotifier<AsyncValue<User?>> {
  AuthStateNotifier(this._ref, this._authService)
    : super(const AsyncValue.loading()) {
    _loadCurrentUser();
    _otherTabSignOut = browserSignOutEvents().listen((_) {
      if (!mounted) return;
      _operation += 1;
      unawaited(_authService.clearAfterOtherTabSignOut());
      _ref.read(profileSetupRequestedProvider.notifier).state = false;
      state = const AsyncValue.data(null);
      _bumpTokenVersion();
    });
  }

  final Ref _ref;
  final AuthService _authService;
  int _operation = 0;
  StreamSubscription<void>? _otherTabSignOut;
  bool _current(int operation) => mounted && operation == _operation;

  void _bumpTokenVersion() {
    final notifier = _ref.read(tokenVersionProvider.notifier);
    notifier.state = notifier.state + 1;
  }

  void setUser(User user) {
    _operation += 1;
    _ref.read(guestModeProvider.notifier).state = false;
    state = AsyncValue.data(user);
    _bumpTokenVersion();
  }

  Future<void> _loadCurrentUser() async {
    final operation = ++_operation;
    try {
      final user = await _authService.getCurrentUser();
      if (!_current(operation)) return;
      state = AsyncValue.data(user);
    } catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(error, stackTrace);
    }
  }

  Future<void> signInWithEmail(String email, String password) async {
    final operation = ++_operation;
    try {
      _ref.read(guestModeProvider.notifier).state = false;
      state = const AsyncValue.loading();
      final user = await _authService.loginWithEmail(email, password);
      if (!_current(operation)) return;
      _ref.read(profileSetupRequestedProvider.notifier).state = true;
      state = AsyncValue.data(user);
      _bumpTokenVersion();
    } on AuthFailure catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(error, stackTrace);
    } catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(
        AuthFailure.serverError('Unable to sign in. Please try again.'),
        stackTrace,
      );
    }
  }

  Future<void> refreshToken() async {
    final operation = ++_operation;
    try {
      if (!await _authService.refreshSession()) {
        throw AuthFailure.invalidCredentials('Session expired');
      }
      if (!_current(operation)) return;
      _bumpTokenVersion();
    } on AuthFailure catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(error, stackTrace);
    } catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(
        AuthFailure.serverError(
          'Unable to refresh your session. Please sign in again.',
        ),
        stackTrace,
      );
    }
  }

  Future<void> signOut() async {
    final operation = ++_operation;
    _ref.read(profileSetupRequestedProvider.notifier).state = false;
    _ref.read(guestModeProvider.notifier).state = false;
    state = const AsyncValue.data(null);
    _bumpTokenVersion();
    try {
      await _authService.logout();
    } finally {
      if (_current(operation)) {
        state = _authService.remoteLogoutConfirmed
            ? const AsyncValue.data(null)
            : AsyncValue.error(
                AuthFailure.networkError(
                  'Signed out here. The server session could not be revoked yet; reconnect and sign out again.',
                ),
                StackTrace.current,
              );
        _bumpTokenVersion();
      }
    }
  }

  Future<void> continueAsGuest() async {
    final operation = ++_operation;
    _ref.read(profileSetupRequestedProvider.notifier).state = false;
    try {
      await _authService.logout();
    } catch (_) {
      // Guest mode remains available when remote logout is unavailable.
    }
    if (!_current(operation)) return;
    _ref.read(guestModeProvider.notifier).state = true;
    state = const AsyncValue.data(null);
    _bumpTokenVersion();
  }

  Future<void> validateToken() async {
    final operation = ++_operation;
    try {
      if (!await _authService.validateAndRefreshToken()) {
        if (!_current(operation)) return;
        state = const AsyncValue.data(null);
      } else {
        final user = await _authService.getCurrentUser();
        if (!_current(operation)) return;
        state = AsyncValue.data(user);
      }
      _bumpTokenVersion();
    } catch (error, stackTrace) {
      if (!_current(operation)) return;
      state = AsyncValue.error(error, stackTrace);
    }
  }

  @override
  void dispose() {
    _operation += 1;
    unawaited(_otherTabSignOut?.cancel());
    super.dispose();
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

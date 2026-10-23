import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class _SyntheticAuth extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _SyntheticAuth(bool restoring)
    : super(
        restoring ? const AsyncValue.loading() : const AsyncValue.data(null),
      );

  @override
  Future<void> signInWithEmail(String email, String password) async {
    state = const AsyncValue.loading();
    await Future<void>.delayed(const Duration(milliseconds: 600));
    if (mounted) {
      state = AsyncValue.error(
        AuthFailure.invalidCredentials('Invalid email or password'),
        StackTrace.current,
      );
    }
  }

  @override
  Future<void> continueAsGuest() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Synthetic sign-in fixture only');
}

class _SyntheticGuard implements DeviceIntegrityGuard {
  @override
  Future<DeviceIntegrityDecision> evaluate(IntegrityUseCase useCase) async =>
      DeviceIntegrityDecision.allow();

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Synthetic sign-in fixture only');
}

void main() {
  final query = Uri.base.queryParameters;
  GoogleFonts.config.allowRuntimeFetching = false;
  runApp(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith(
          (_) => _SyntheticAuth(query['state'] == 'restoring'),
        ),
        deviceIntegrityGuardProvider.overrideWithValue(_SyntheticGuard()),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      ],
      child: MaterialApp(
        title: 'Lythaus synthetic sign-in QA',
        debugShowCheckedModeBanner: false,
        theme: query['theme'] == 'dark'
            ? LythausTheme.dark()
            : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(
              double.tryParse(query['scale'] ?? '') ?? 1,
            ),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: Builder(
          builder: (context) => AuthChoiceScreen(
            launchAuthPage: (_) async {
              await Future<void>.delayed(const Duration(milliseconds: 300));
              return false;
            },
            onContinueAsGuest: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const Scaffold(
                  body: Center(child: Text('Synthetic continuation completed')),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

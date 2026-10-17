import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

import 'adaptive_shell_entry.dart' as navigation;

class _BrandAuth extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _BrandAuth() : super(const AsyncValue.data(null));

  @override
  Future<void> continueAsGuest() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Brand fixture cannot authenticate');
}

void main() {
  final screen = Uri.base.queryParameters['screen'];
  if (screen != 'login' && screen != 'onboarding') {
    navigation.main();
    return;
  }
  GoogleFonts.config.allowRuntimeFetching = false;
  runApp(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((_) => _BrandAuth()),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: Uri.base.queryParameters['theme'] == 'dark'
            ? LythausTheme.dark()
            : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(
              double.tryParse(Uri.base.queryParameters['scale'] ?? '') ?? 1,
            ),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: Builder(
          builder: (context) {
            void complete() => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const Scaffold(
                  body: Center(child: Text('Synthetic continuation completed')),
                ),
              ),
            );
            return screen == 'login'
                ? AuthChoiceScreen(onContinueAsGuest: complete)
                : OnboardingIntroScreen(onContinue: complete);
          },
        ),
      ),
    ),
  );
}

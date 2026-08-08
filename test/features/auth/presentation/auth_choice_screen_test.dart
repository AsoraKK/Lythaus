import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class _MockAuthService extends Mock implements AuthService {}

void main() {
  testWidgets('renders email and guest launch options', (tester) async {
    final authService = _MockAuthService();
    when(() => authService.getCurrentUser()).thenAnswer((_) async => null);
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          enhancedAuthServiceProvider.overrideWithValue(authService),
        ],
        child: const MaterialApp(home: AuthChoiceScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome to Lythaus'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in with email'), findsOneWidget);
    expect(find.text('Continue as guest'), findsOneWidget);
  });
}

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: '/api/users/me'));
    registerFallbackValue(Options());
  });

  testWidgets('SettingsScreen toggles local preferences', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    final leftHandedTile = find.widgetWithText(
      SwitchListTile,
      'Left-handed mode (mirror nav)',
    );
    final hapticsTile = find.widgetWithText(SwitchListTile, 'Haptics');

    expect(tester.widget<SwitchListTile>(leftHandedTile).value, isFalse);
    expect(tester.widget<SwitchListTile>(hapticsTile).value, isTrue);

    await tester.tap(leftHandedTile);
    await tester.tap(hapticsTile);
    await tester.pumpAndSettle();

    final state = container.read(settingsProvider);
    expect(state.leftHandedMode, isTrue);
    expect(state.hapticsEnabled, isFalse);
    expect(
      find.text('Sign in to manage what others see on your Trust Passport.'),
      findsOneWidget,
    );
  });

  testWidgets('authenticated users can update trust visibility', (
    tester,
  ) async {
    final dio = _MockDio();
    when(
      () => dio.patch<Map<String, dynamic>>(
        '/api/users/me',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: const {},
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/users/me'),
      ),
    );

    final user = User(
      id: 'u1',
      email: 'u1@lythaus.app',
      role: UserRole.user,
      tier: UserTier.bronze,
      reputationScore: 0,
      createdAt: DateTime(2025, 1, 1),
      lastLoginAt: DateTime(2025, 1, 2),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureDioProvider.overrideWithValue(dio),
          currentUserProvider.overrideWithValue(user),
          jwtProvider.overrideWith((ref) async => 'token'),
          publicUserProvider.overrideWith(
            (ref, userId) async => const PublicUser(
              id: 'u1',
              displayName: 'Lythaus User',
              tier: 'free',
              trustPassportVisibility: 'public_minimal',
            ),
          ),
        ],
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Private').first);
    await tester.pumpAndSettle();

    verify(
      () => dio.patch<Map<String, dynamic>>(
        '/api/users/me',
        data: {'trustPassportVisibility': 'private'},
        options: any(named: 'options'),
      ),
    ).called(1);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(SettingsScreen)),
    );
    expect(container.read(settingsProvider).trustPassportVisibility, 'private');
  });

  testWidgets(
    'shows rate limit message when trust visibility update is throttled',
    (tester) async {
      final dio = _MockDio();
      when(
        () => dio.patch<Map<String, dynamic>>(
          '/api/users/me',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/users/me'),
          response: Response<Map<String, dynamic>>(
            data: const {'error': 'rate_limited', 'retry_after_seconds': 30},
            statusCode: 429,
            requestOptions: RequestOptions(path: '/api/users/me'),
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      final user = User(
        id: 'u1',
        email: 'u1@lythaus.app',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime(2025, 1, 1),
        lastLoginAt: DateTime(2025, 1, 2),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            secureDioProvider.overrideWithValue(dio),
            currentUserProvider.overrideWithValue(user),
            jwtProvider.overrideWith((ref) async => 'token'),
            publicUserProvider.overrideWith(
              (ref, userId) async => const PublicUser(
                id: 'u1',
                displayName: 'Lythaus User',
                tier: 'free',
                trustPassportVisibility: 'public_minimal',
              ),
            ),
          ],
          child: const MaterialApp(home: SettingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Private').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        find.text('Too many profile updates. Please wait before trying again.'),
        findsOneWidget,
      );
    },
  );
}

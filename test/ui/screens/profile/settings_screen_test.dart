import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/support/support_feedback_config.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: '/api/users/me'));
    registerFallbackValue(Options());
    registerFallbackValue(CancelToken());
  });

  testWidgets(
    'authenticated Settings expose distinct private support entry points',
    (tester) async {
      final user = User(
        id: 'u-support',
        email: 'support@lythaus.app',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime(2025, 1, 1),
        lastLoginAt: DateTime(2025, 1, 2),
      );
      final source = StateController<Object?>(user);
      addTearDown(source.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authSessionRevisionProvider.overrideWith(
              (ref) => AuthSessionRevision(source),
            ),
            currentUserProvider.overrideWithValue(user),
            ownerProfileProvider.overrideWith(
              (ref) async => OwnerProfile(
                user: PublicUser(
                  id: user.id,
                  displayName: 'Synthetic support member',
                  tier: 'free',
                  trustPassportVisibility: 'private',
                ),
                moderationState: 'active',
                publicVisibility: false,
              ),
            ),
          ],
          child: const MaterialApp(home: SettingsScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Report a problem'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.scrollUntilVisible(
        find.text('Feedback and suggestions'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Report a problem'), findsOneWidget);
      expect(find.text('Feedback and suggestions'), findsOneWidget);
      expect(
        find.text('Send a private bug report and follow its history'),
        findsOneWidget,
      );
      expect(
        find.text('Share a private idea and follow its history'),
        findsOneWidget,
      );
    },
    skip: !supportFeedbackEnabled,
  );

  testWidgets('SettingsScreen saves separate guest preferences explicitly', (
    tester,
  ) async {
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
    final swipeTile = find.widgetWithText(
      SwitchListTile,
      'Swipe between profile tabs',
    );

    expect(tester.widget<SwitchListTile>(leftHandedTile).value, isFalse);
    expect(tester.widget<SwitchListTile>(swipeTile).value, isTrue);

    await tester.tap(leftHandedTile);
    await tester.ensureVisible(swipeTile);
    await tester.pumpAndSettle();
    await tester.tap(swipeTile);
    await tester.pumpAndSettle();

    expect(container.read(settingsProvider).leftHandedMode, isFalse);
    final save = find.text('Save preferences');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();

    final state = container.read(settingsProvider);
    expect(state.leftHandedMode, isTrue);
    expect(state.horizontalSwipeEnabled, isFalse);
    expect(state.hapticsEnabled, isTrue);
    expect(find.widgetWithText(SwitchListTile, 'Haptics'), findsNothing);
    expect(
      find.text('Haptic feedback is not available in this app yet.'),
      findsOneWidget,
    );
    expect(
      find.text('Sign in to manage what others see on your Trust Passport.'),
      findsOneWidget,
    );
  });

  testWidgets('authenticated users can update trust visibility', (
    tester,
  ) async {
    final dio = _MockDio();
    var visibility = 'public_minimal';
    when(
      () => dio.patch<Map<String, dynamic>>(
        '/api/users/me',
        data: any(named: 'data'),
        cancelToken: any(named: 'cancelToken'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) async {
      visibility = 'private';
      return Response<Map<String, dynamic>>(
        data: {
          'user': {
            'id': 'u1',
            'displayName': 'Lythaus User',
            'moderationState': 'under_review',
            'publicVisibility': false,
            'trustPassportVisibility': visibility,
          },
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/api/users/me'),
      );
    });

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
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(StateController<User?>(user)),
          ),
          currentUserProvider.overrideWithValue(user),
          jwtProvider.overrideWith((ref) async => 'token'),
          ownerProfileProvider.overrideWith(
            (ref) async => OwnerProfile(
              user: PublicUser(
                id: 'u1',
                displayName: 'Lythaus User',
                tier: 'free',
                trustPassportVisibility: visibility,
              ),
              moderationState: 'under_review',
              publicVisibility: false,
            ),
          ),
        ],
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    final privateOption = find.text('Private');
    await tester.scrollUntilVisible(
      privateOption,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await Scrollable.ensureVisible(
      tester.element(privateOption),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    expect(privateOption.hitTestable(), findsOneWidget);
    await tester.tap(privateOption);
    await tester.pumpAndSettle();

    verify(
      () => dio.patch<Map<String, dynamic>>(
        '/api/users/me',
        data: {'trustPassportVisibility': 'private'},
        cancelToken: any(named: 'cancelToken'),
        options: any(named: 'options'),
      ),
    ).called(1);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(SettingsScreen)),
    );
    expect(
      container
          .read(ownerProfileProvider)
          .valueOrNull
          ?.user
          .trustPassportVisibility,
      'private',
    );
  });

  testWidgets(
    'shows rate limit message when trust visibility update is throttled',
    (tester) async {
      final dio = _MockDio();
      when(
        () => dio.patch<Map<String, dynamic>>(
          '/api/users/me',
          data: any(named: 'data'),
          cancelToken: any(named: 'cancelToken'),
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
            authSessionRevisionProvider.overrideWith(
              (ref) => AuthSessionRevision(StateController<User?>(user)),
            ),
            currentUserProvider.overrideWithValue(user),
            jwtProvider.overrideWith((ref) async => 'token'),
            ownerProfileProvider.overrideWith(
              (ref) async => const OwnerProfile(
                user: PublicUser(
                  id: 'u1',
                  displayName: 'Lythaus User',
                  tier: 'free',
                  trustPassportVisibility: 'public_minimal',
                ),
                moderationState: 'under_review',
                publicVisibility: false,
              ),
            ),
          ],
          child: const MaterialApp(home: SettingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      final privateOption = find.text('Private');
      await tester.scrollUntilVisible(
        privateOption,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await Scrollable.ensureVisible(
        tester.element(privateOption),
        alignment: 0.5,
      );
      await tester.pumpAndSettle();
      expect(privateOption.hitTestable(), findsOneWidget);
      await tester.tap(privateOption);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        find.text('Too many profile updates. Please wait before trying again.'),
        findsOneWidget,
      );
    },
  );
}

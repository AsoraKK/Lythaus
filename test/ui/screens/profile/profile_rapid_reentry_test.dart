import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/ui/screens/profile/edit_profile_screen.dart';

User user() => User(
  id: 'synthetic-a',
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
final session = StateProvider<User?>((ref) => user());
Map<String, dynamic> owner(String visibility) => {
  'user': {
    'id': 'synthetic-a',
    'displayName': 'Synthetic owner',
    'moderationState': 'allowed',
    'publicVisibility': visibility != 'private',
    'trustPassportVisibility': visibility,
  },
};
ResponseBody body(String visibility) => ResponseBody.fromString(
  jsonEncode(owner(visibility)),
  200,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
  },
);

class Adapter implements HttpClientAdapter {
  final entered = Completer<void>();
  final pending = Completer<ResponseBody>();
  bool cancelled = false;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    if (options.method == 'PATCH') {
      if (!entered.isCompleted) entered.complete();
      cancelFuture?.then((_) => cancelled = true);
      return pending.future;
    }
    return Future.value(body('public_minimal'));
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  testWidgets('rapid same-account reentry must cancel old visibility save', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final adapter = Adapter();
    final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
      ..httpClientAdapter = adapter;
    final container = ProviderContainer(
      overrides: [
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(ref.read(session.notifier)),
        ),
        secureDioProvider.overrideWithValue(dio),
        currentUserProvider.overrideWith((ref) => ref.watch(session)),
        jwtProvider.overrideWith(
          (ref) async =>
              ref.watch(currentUserProvider) == null ? null : 'synthetic-token',
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();
    final option = find.widgetWithText(ChoiceChip, 'Private');
    await tester.ensureVisible(option);
    await tester.tap(option);
    await tester.pumpAndSettle();
    container.read(session.notifier).state = null;
    container.read(session.notifier).state = user();
    await tester.pumpAndSettle();
    adapter.pending.complete(body('private'));
    await tester.pumpAndSettle();
    expect(adapter.cancelled, isTrue);
    expect(find.text('Profile visibility saved.'), findsNothing);
  });
  testWidgets(
    'rapid same-account reentry must fence inherited edit-profile save',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(430, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final adapter = Adapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://local.invalid'))
        ..httpClientAdapter = adapter;
      final container = ProviderContainer(
        overrides: [
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(ref.read(session.notifier)),
          ),
          secureDioProvider.overrideWithValue(dio),
          currentUserProvider.overrideWith((ref) => ref.watch(session)),
          jwtProvider.overrideWith((ref) async => 'synthetic-token'),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => EditProfileScreen(
                        profile: OwnerProfile.fromJson(owner('public_minimal')),
                      ),
                    ),
                  ),
                  child: const Text('Open editor'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open editor'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Display name (optional)'),
        'Synthetic new name',
      );
      await tester.pump();
      await tester.tap(find.text('Save profile'));
      for (
        var attempt = 0;
        attempt < 8 && !adapter.entered.isCompleted;
        attempt++
      ) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(adapter.entered.isCompleted, isTrue);
      container.read(session.notifier).state = null;
      container.read(session.notifier).state = user();
      await tester.pump();
      await tester.pump();
      adapter.pending.complete(body('private'));
      await tester.pumpAndSettle();
      expect(adapter.cancelled, isTrue);
      expect(find.byType(EditProfileScreen), findsOneWidget);
    },
  );
}

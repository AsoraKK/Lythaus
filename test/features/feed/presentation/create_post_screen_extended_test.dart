import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import '../../../helpers/content_recovery.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/presentation/content_submission_gate.dart';

class _AuthNotifier extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _AuthNotifier(User user) : super(AsyncValue.data(user));

  @override
  Future<void> continueAsGuest() async {}

  @override
  Future<void> refreshToken() async {}

  @override
  void setUser(User user) => state = AsyncValue.data(user);

  @override
  Future<void> signInWithEmail(String email, String password) async {}

  @override
  Future<void> signOut() async => state = const AsyncValue.data(null);

  @override
  Future<void> validateToken() async {}
}

User _user() => User(
  id: 'user-1',
  email: 'member@example.com',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime(2026),
  lastLoginAt: DateTime(2026),
);

Widget _screen({
  MemoryContentRecoveryStorage? storage,
  bool viaNavigator = false,
}) {
  final user = _user();
  return ProviderScope(
    overrides: [
      contentRecoveryStorageProvider.overrideWithValue(
        storage ?? MemoryContentRecoveryStorage(),
      ),
      authStateProvider.overrideWith((ref) => _AuthNotifier(user)),
      jwtProvider.overrideWith((ref) async => 'token'),
    ],
    child: MaterialApp(
      home: viaNavigator
          ? Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const CreatePostScreen(),
                    ),
                  ),
                  child: const Text('Open composer'),
                ),
              ),
            )
          : const CreatePostScreen(),
    ),
  );
}

void main() {
  test(
    'reopening a retained post composer refreshes expiry without recreating its provider',
    () async {
      final storage = MemoryContentRecoveryStorage();
      var now = DateTime.utc(2026, 10, 2);
      final registry = ContentMutationRegistry(
        storage: storage,
        clock: () => now,
      )..activate('user-1');
      await registry.ready;
      final container = ProviderContainer(
        overrides: [
          currentUserProvider.overrideWithValue(_user()),
          contentMutationRegistryProvider.overrideWith((ref) => registry),
        ],
      );
      addTearDown(container.dispose);
      final notifier = container.read(postCreationProvider.notifier);
      notifier.updateText('Expired retained post body');
      notifier.setAiLabel('human');
      final attempt = await registry.beginDurable('post-create:user-1', {
        'body': 'Expired retained post body',
        'declaredCreationMode': 'human',
        'geoScope': 'none',
      });
      await registry.finishDurable(attempt, uncertain: true);
      await Future<void>.delayed(Duration.zero);
      now = now.add(const Duration(days: 8));
      notifier.refreshDraftOnOpen();
      await registry.refresh();
      expect(notifier.state.text, isEmpty);
      expect(notifier.state.draftStatus, contains('Re-enter the same text'));
      expect(registry.pending(attempt.scope)!.key, attempt.key);
      expect(
        storage.values.values.join(),
        isNot(contains('Expired retained post body')),
      );
    },
  );

  testWidgets(
    'discard requires a saved journal update and preserves text on storage failure',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      await tester.pumpWidget(_screen(storage: storage, viaNavigator: true));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open composer'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField).first,
        'Synthetic discard draft',
      );
      await tester.pumpAndSettle();
      storage.failWrites = true;
      await tester.enterText(
        find.byType(TextField).first,
        'Synthetic discard draft with an unsaved edit',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(find.text('Discard post?'), findsOneWidget);
      expect(
        find.text('Draft could not be discarded. Keep editing and try again.'),
        findsOneWidget,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        'Synthetic discard draft with an unsaved edit',
      );
      expect(storage.values.values.join(), contains('Synthetic discard draft'));
      storage.failWrites = false;
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(find.text('Open composer'), findsOneWidget);
      expect(
        storage.values.values.join(),
        isNot(contains('Synthetic discard draft')),
      );
      await tester.tap(find.text('Open composer'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        isEmpty,
      );
    },
  );

  testWidgets(
    'closing a saved draft preserves text and historical declaration quietly',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      await tester.pumpWidget(_screen(storage: storage, viaNavigator: true));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open composer'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField).first,
        'Saved private draft',
      );
      await tester.pump();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      );
      container.read(postCreationProvider.notifier).setAiLabel('human');
      await tester.pumpAndSettle();
      expect(find.text('Draft saved on this device.'), findsOneWidget);

      await tester.tap(find.byTooltip('Close composer'));
      await tester.pumpAndSettle();
      expect(find.text('Discard post?'), findsNothing);
      expect(find.text('Open composer'), findsOneWidget);

      await tester.tap(find.text('Open composer'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        'Saved private draft',
      );
      expect(container.read(postCreationProvider).aiLabel, 'human');
      expect(find.text('Human-authored'), findsNothing);
      expect(find.text('AI-assisted'), findsNothing);
    },
  );

  testWidgets(
    'keeps drafts declaration-free and explains current posting policy',
    (tester) async {
      await tester.pumpWidget(_screen());
      await tester.pumpAndSettle();

      expect(find.text('Human-authored'), findsNothing);
      expect(find.text('AI-assisted'), findsNothing);
      expect(find.text('AI-generated'), findsNothing);
      expect(find.text('How did you write this?'), findsNothing);
      expect(find.textContaining('This is your declaration'), findsNothing);
      expect(find.text(contentSubmissionUnavailableMessage), findsOneWidget);
      await tester.ensureVisible(find.text('Posting policy'));
      await tester.tap(find.text('Posting policy'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'AI-generated or AI-edited media are not permitted.',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'AI-generated text may contain up to 250 characters.',
        ),
        findsOneWidget,
      );
      expect(find.text('Human-authored'), findsNothing);
      expect(find.text('AI-assisted'), findsNothing);
    },
  );

  testWidgets(
    'restored assisted declaration does not impose a legacy UI draft cap',
    (tester) async {
      await tester.pumpWidget(_screen());
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      );
      container.read(postCreationProvider.notifier).setAiLabel('assisted');
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'a' * 250);
      await tester.pump();

      expect(find.text('250/5000'), findsOneWidget);
      expect(find.textContaining('249'), findsNothing);
      expect(container.read(postCreationProvider).text, 'a' * 250);
      expect(find.text('Human-authored'), findsNothing);
      expect(find.text('AI-assisted'), findsNothing);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Post'))
            .onPressed,
        isNull,
      );
    },
  );
}

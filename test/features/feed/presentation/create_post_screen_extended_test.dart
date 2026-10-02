import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';

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
        'Synthetic discard draft',
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

  testWidgets('offers only allowed public authorship choices', (tester) async {
    await tester.pumpWidget(_screen());
    await tester.pumpAndSettle();

    expect(find.text('Human-authored'), findsOneWidget);
    expect(find.text('AI-assisted'), findsOneWidget);
    expect(find.text('AI-generated'), findsNothing);
    expect(
      find.textContaining('AI-generated public content is not allowed'),
      findsOneWidget,
    );
  });

  testWidgets('shows the grapheme-aware assisted boundary', (tester) async {
    await tester.pumpWidget(_screen());
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('AI-assisted'));
    await tester.tap(find.text('AI-assisted'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'a' * 250);
    await tester.pump();

    expect(
      find.textContaining('AI-assisted public text cannot exceed 249'),
      findsOneWidget,
    );
  });
}

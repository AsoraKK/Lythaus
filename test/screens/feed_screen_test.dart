import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/screens/feed_screen.dart';

// Mock classes
class MockUser extends Mock implements User {}

class MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    with Mock
    implements AuthStateNotifier {
  MockAuthStateNotifier(super.initialState);

  @override
  Future<void> signOut() async {
    // Mock implementation
  }
}

void main() {
  group('FeedScreen', () {
    testWidgets('renders correctly for guest user', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // The screen should render even with loading auth state
      // Verify basic UI elements are present
      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('displays app bar with menu icon', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify app bar has person outline icon (used as menu button)
      expect(find.byIcon(Icons.person_outline), findsOneWidget);
      expect(find.text('Lythaus'), findsOneWidget);
    });

    testWidgets('can open and interact with drawer', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Verify drawer is open and has expected items
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('About Lythaus'), findsOneWidget);
    });

    testWidgets('shows about dialog when about is tapped', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Tap about
      await tester.tap(find.text('About Lythaus'));
      await tester.pumpAndSettle();

      // Verify about dialog appears (check for dialog content)
      expect(
        find.text(
          'A social platform for authentic human-authored content with AI-powered verification.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('shows coming soon snackbar for navigation items', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer first
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Tap sign in navigation (available for guest users)
      await tester.tap(find.text('Sign In'));
      await tester.pumpAndSettle();

      // Verify coming soon snackbar
      expect(find.text('Sign In is coming soon.'), findsOneWidget);
    });

    testWidgets('displays feed content with posts', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify feed has content
      expect(find.byType(Card), findsWidgets); // Post cards
      expect(
        find.byType(CustomPaint),
        findsWidgets,
      ); // Background pattern and others
    });

    testWidgets('does not render AI confidence chips in posts', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('AI Gen'), findsNothing);
      expect(find.text('High'), findsNothing);
      expect(find.text('Medium'), findsNothing);
      expect(find.text('Low'), findsNothing);
    });

    testWidgets('handles scroll and pagination', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Find scrollable area
      final scrollable = find.byType(Scrollable);
      expect(scrollable, findsOneWidget);

      // Scroll down to test scrolling functionality
      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();

      // Verify scrolling worked (list should still be present)
      expect(find.byType(ListView), findsOneWidget);
      expect(find.byType(Card), findsWidgets);
    });

    testWidgets('shows sign in prompt for post interactions', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Try to tap a like button
      await tester.tap(find.byIcon(Icons.thumb_up_alt_outlined).first);
      await tester.pumpAndSettle();

      // Should show sign in prompt
      expect(find.text('Sign in to like, comment, or report.'), findsOneWidget);
    });

    testWidgets('renders background pattern', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify custom paint for background pattern
      expect(find.byType(CustomPaint), findsWidgets);
    });

    testWidgets('handles drawer close', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();
      expect(find.text('Sign In'), findsOneWidget);

      // Try to close drawer by tapping outside
      // Note: This behavior may vary, but the test ensures no crashes
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      // Screen should still be functional
      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows authenticated user drawer with profile options', (
      tester,
    ) async {
      final mockUser = MockUser();
      final mockNotifier = MockAuthStateNotifier(AsyncValue.data(mockUser));
      when(() => mockUser.id).thenReturn('user123');
      when(() => mockUser.email).thenReturn('test@example.com');
      when(() => mockUser.role).thenReturn(UserRole.user);
      when(() => mockUser.reputationScore).thenReturn(100);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [authStateProvider.overrideWith((ref) => mockNotifier)],
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Verify authenticated user drawer items
      expect(find.text('Welcome back!'), findsOneWidget);
      expect(find.text('Profile'), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Privacy Settings'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Help & Support'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);
    });

    testWidgets('shows sign out confirmation dialog', (tester) async {
      final mockUser = MockUser();
      final mockNotifier = MockAuthStateNotifier(AsyncValue.data(mockUser));
      when(() => mockUser.id).thenReturn('user123');
      when(() => mockUser.role).thenReturn(UserRole.user);
      when(() => mockUser.reputationScore).thenReturn(100);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [authStateProvider.overrideWith((ref) => mockNotifier)],
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Tap sign out
      await tester.tap(find.text('Sign Out'));
      await tester.pumpAndSettle();

      // Verify confirmation dialog appears
      expect(find.text('Are you sure you want to sign out?'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.byType(AlertDialog), findsOneWidget);
    });

    testWidgets('handles sign out cancellation', (tester) async {
      final mockUser = MockUser();
      final mockNotifier = MockAuthStateNotifier(AsyncValue.data(mockUser));
      when(() => mockUser.id).thenReturn('user123');
      when(() => mockUser.role).thenReturn(UserRole.user);
      when(() => mockUser.reputationScore).thenReturn(100);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [authStateProvider.overrideWith((ref) => mockNotifier)],
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Tap sign out
      await tester.tap(find.text('Sign Out'));
      await tester.pumpAndSettle();

      // Tap cancel
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      // Verify dialog is dismissed and drawer is still open
      expect(find.text('Are you sure you want to sign out?'), findsNothing);
      expect(find.text('Profile'), findsOneWidget); // Drawer still open
    });

    testWidgets('shows moderator drawer items for moderator user', (
      tester,
    ) async {
      final mockUser = MockUser();
      when(() => mockUser.id).thenReturn('mod123');
      when(() => mockUser.role).thenReturn(UserRole.moderator);
      when(() => mockUser.reputationScore).thenReturn(500);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => MockAuthStateNotifier(AsyncValue.data(mockUser)),
            ),
          ],
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Open drawer
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Verify moderator-specific items
      expect(find.text('Moderation Queue'), findsOneWidget);
    });

    testWidgets('allows authenticated user to interact with posts', (
      tester,
    ) async {
      final mockUser = MockUser();
      when(() => mockUser.id).thenReturn('user123');
      when(() => mockUser.role).thenReturn(UserRole.user);
      when(() => mockUser.reputationScore).thenReturn(100);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => MockAuthStateNotifier(AsyncValue.data(mockUser)),
            ),
          ],
          child: MaterialApp(
            theme: LythausTheme.dark(),
            home: const FeedScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Try to tap a like button (should work for authenticated users)
      await tester.tap(find.byIcon(Icons.thumb_up_alt_outlined).first);
      await tester.pumpAndSettle();

      // For authenticated users, no sign-in prompt should appear
      expect(find.text('Sign in to like, comment, or report.'), findsNothing);
    });
  });
}

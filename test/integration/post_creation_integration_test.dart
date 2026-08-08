/// Integration test for post creation flow with mocked repository
///
/// Tests the complete happy path of post creation:
/// 1. User opens create post screen
/// 2. User enters post text
/// 3. User taps submit
/// 4. Post is created successfully
/// 5. User sees success message and is returned to feed
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';

// Mock classes
class MockPostRepository extends Mock implements PostRepository {}

/// Test user factory
User createTestUser() {
  return User(
    id: 'test-user-id',
    email: 'test@example.com',
    role: UserRole.user,
    tier: UserTier.bronze,
    reputationScore: 100,
    createdAt: DateTime.now(),
    lastLoginAt: DateTime.now(),
  );
}

Future<void> chooseHumanAuthorship(WidgetTester tester) async {
  await tester.tap(find.text('Human-authored'));
  await tester.pump();
}

/// Mock AuthStateNotifier for testing
class MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  MockAuthStateNotifier(User? user) : super(AsyncValue.data(user));

  @override
  Future<void> refreshToken() async {}

  @override
  Future<void> signInWithEmail(String email, String password) async {}

  @override
  Future<void> signOut() async {
    state = const AsyncValue.data(null);
  }

  @override
  Future<void> validateToken() async {}
  @override
  Future<void> continueAsGuest() async {}
  @override
  void setUser(User user) {
    state = AsyncValue.data(user);
  }
}

void main() {
  late MockPostRepository mockRepository;
  late Post createdPost;

  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fallback'));
  });

  setUp(() {
    mockRepository = MockPostRepository();

    // Create the expected post that will be "created"
    createdPost = Post(
      id: 'new-post-123',
      authorId: 'test-user-id',
      authorUsername: 'testuser',
      text: 'My first post on Lythaus!',
      createdAt: DateTime.now(),
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
    );
  });

  group('Post Creation Integration Tests', () {
    testWidgets('successful post creation flow - happy path', (tester) async {
      // Arrange: Setup mock to return success
      when(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => CreatePostSuccess(createdPost));

      Post? returnedPost;

      // Build the test app with a host screen that can receive the result
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: const Center(child: Text('Feed Screen')),
                floatingActionButton: FloatingActionButton(
                  onPressed: () async {
                    final result = await Navigator.of(context).push<Post>(
                      MaterialPageRoute(
                        builder: (context) => const CreatePostScreen(),
                        fullscreenDialog: true,
                      ),
                    );
                    returnedPost = result;
                  },
                  child: const Icon(Icons.add),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify we're on the "feed" screen
      expect(find.text('Feed Screen'), findsOneWidget);

      // Act: Open create post screen
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // Verify create post screen is shown
      expect(find.text('Create Post'), findsOneWidget);
      expect(find.textContaining('5000 characters remaining'), findsOneWidget);

      // Enter post text
      final textField = find.byType(TextField);
      await tester.enterText(textField, 'My first post on Lythaus!');
      await tester.pump();
      await chooseHumanAuthorship(tester);

      // Verify character count updated
      expect(find.textContaining('4975 characters remaining'), findsOneWidget);

      // Verify Post button is enabled
      final postButton = find.widgetWithText(FilledButton, 'Post');
      final button = tester.widget<FilledButton>(postButton);
      expect(button.onPressed, isNotNull);

      // Tap Post button
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      // Verify the repository was called with correct parameters
      verify(
        () => mockRepository.createPost(
          request: any(
            named: 'request',
            that: predicate<CreatePostRequest>(
              (r) => r.text == 'My first post on Lythaus!' && r.mediaUrl == null,
            ),
          ),
          token: 'test-jwt-token',
        ),
      ).called(1);

      // Verify we're back on the feed screen (dialog closed)
      expect(find.text('Feed Screen'), findsOneWidget);

      // Verify the post was returned
      expect(returnedPost, isNotNull);
      expect(returnedPost?.id, 'new-post-123');
      expect(returnedPost?.text, 'My first post on Lythaus!');
    });

    testWidgets('content blocked flow - moderation rejection', (tester) async {
      // Arrange: Setup mock to return blocked
      when(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => const CreatePostBlocked(
          message: 'Your post contains content that violates our guidelines',
          categories: ['harassment', 'hate_speech'],
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: const MaterialApp(home: CreatePostScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Enter inappropriate content
      final textField = find.byType(TextField);
      await tester.enterText(textField, 'Some inappropriate content');
      await tester.pump();
      await chooseHumanAuthorship(tester);

      // Submit
      final postButton = find.widgetWithText(FilledButton, 'Post');
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      // Verify content blocked banner is shown
      expect(find.text('Content Blocked'), findsOneWidget);
      expect(
        find.text('Your post contains content that violates our guidelines'),
        findsOneWidget,
      );
      expect(find.text('harassment'), findsOneWidget);
      expect(find.text('hate_speech'), findsOneWidget);

      // User should still be on the create post screen (not closed)
      expect(find.text('Create Post'), findsOneWidget);

      // Text should still be there so user can modify it
      expect(find.text('Some inappropriate content'), findsOneWidget);
    });

    testWidgets('daily limit exceeded flow', (tester) async {
      // Arrange: Setup mock to return limit exceeded
      when(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => const CreatePostLimitExceeded(
          message: 'You have reached your daily post limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 18, minutes: 30),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: const MaterialApp(home: CreatePostScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Enter content
      final textField = find.byType(TextField);
      await tester.enterText(textField, 'Another post');
      await tester.pump();
      await chooseHumanAuthorship(tester);

      // Submit
      final postButton = find.widgetWithText(FilledButton, 'Post');
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      // Verify limit exceeded banner is shown
      expect(find.text('Daily Limit Reached'), findsOneWidget);
      expect(find.textContaining('10 posts'), findsOneWidget);
      expect(find.textContaining('free'), findsOneWidget);
      expect(find.textContaining('18h'), findsOneWidget);

      // User should still be on the create post screen
      expect(find.text('Create Post'), findsOneWidget);
    });

    testWidgets('network error flow with retry', (tester) async {
      int callCount = 0;

      // Arrange: First call fails, second succeeds
      when(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) {
          return const CreatePostError(
            message: 'Network connection failed. Please try again.',
            code: 'network_error',
          );
        }
        return CreatePostSuccess(createdPost);
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: const MaterialApp(home: CreatePostScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Enter content
      final textField = find.byType(TextField);
      await tester.enterText(textField, 'My first post on Lythaus!');
      await tester.pump();
      await chooseHumanAuthorship(tester);

      // First submit - should fail
      final postButton = find.widgetWithText(FilledButton, 'Post');
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      // Verify error is shown
      expect(
        find.text('Network connection failed. Please try again.'),
        findsOneWidget,
      );
      expect(callCount, 1);

      // Retry - should succeed
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      expect(callCount, 2);
      // On success, the screen closes - we can't verify the snackbar easily
      // but we can verify the screen closed by checking Create Post is gone
      // Note: In this test setup, we don't have a parent navigator to pop to,
      // so the screen will still be there. The success is indicated by the
      // repository being called twice.
    });

    testWidgets('validates input before submission', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: const MaterialApp(home: CreatePostScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Post button should be disabled with empty text
      final postButton = find.widgetWithText(FilledButton, 'Post');
      final button = tester.widget<FilledButton>(postButton);
      expect(button.onPressed, isNull);

      // Enter text
      final textField = find.byType(TextField);
      await tester.enterText(textField, 'Valid content');
      await tester.pump();

      // Text alone is insufficient because disclosure is required.
      final enabledButton = tester.widget<FilledButton>(postButton);
      expect(enabledButton.onPressed, isNull);

      await chooseHumanAuthorship(tester);
      final disclosedButton = tester.widget<FilledButton>(postButton);
      expect(disclosedButton.onPressed, isNotNull);

      // Enter text exceeding max length
      await tester.enterText(textField, 'A' * 5001);
      await tester.pump();

      // Post button should be disabled again
      final disabledButton = tester.widget<FilledButton>(postButton);
      expect(disabledButton.onPressed, isNull);

      // Verify the repository was never called since we never successfully submitted
      verifyNever(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      );
    });

    testWidgets('preserves text when moderation blocks content', (
      tester,
    ) async {
      when(
        () => mockRepository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => const CreatePostBlocked(
          message: 'Content blocked',
          categories: ['spam'],
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postRepositoryProvider.overrideWithValue(mockRepository),
            authStateProvider.overrideWith((ref) {
              return MockAuthStateNotifier(createTestUser());
            }),
            jwtProvider.overrideWith((ref) async => 'test-jwt-token'),
          ],
          child: const MaterialApp(home: CreatePostScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Enter content
      const testText = 'My carefully crafted post content';
      final textField = find.byType(TextField);
      await tester.enterText(textField, testText);
      await tester.pump();
      await chooseHumanAuthorship(tester);

      // Submit and get blocked
      final postButton = find.widgetWithText(FilledButton, 'Post');
      await tester.tap(postButton);
      await tester.pumpAndSettle();

      // Verify blocked banner is shown
      expect(find.text('Content Blocked'), findsOneWidget);

      // Verify text is preserved in the text field
      final textFieldWidget = tester.widget<TextField>(textField);
      expect(textFieldWidget.controller?.text, testText);
    });
  });
}

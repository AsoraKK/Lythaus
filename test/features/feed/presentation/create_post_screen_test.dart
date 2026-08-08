/// Widget tests for post creation form
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';

// Mock classes
class MockPostRepository extends Mock implements PostRepository {}

class _RecordingAnalyticsClient implements AnalyticsClient {
  final List<String> events = [];

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    events.add(name);
  }

  @override
  Future<void> reset() async {}

  @override
  Future<void> setUserId(String? userId) async {}

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {}
}

class _RecordingEventTracker implements AnalyticsEventTracker {
  final List<String> onceEvents = [];

  @override
  Future<bool> logEventOnce(
    AnalyticsClient client,
    String eventName, {
    String? userId,
    Map<String, Object?>? properties,
  }) async {
    onceEvents.add(eventName);
    await client.logEvent(eventName, properties: properties);
    return true;
  }

  @override
  Future<bool> wasLogged(String eventName, {String? userId}) async => false;
}

class FakeDeviceSecurityService implements DeviceSecurityService {
  FakeDeviceSecurityService(this._state);

  final DeviceSecurityState _state;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

/// Wrapper that watches deviceSecurityStateProvider to trigger it in tests
class _SecurityProviderWatcher extends ConsumerWidget {
  const _SecurityProviderWatcher({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch to trigger the FutureProvider
    ref.watch(deviceSecurityStateProvider);
    return child;
  }
}

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

void main() {
  late MockPostRepository mockRepository;

  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fallback'));
  });

  setUp(() {
    mockRepository = MockPostRepository();
  });

  Widget createTestWidget({
    User? user,
    List<Override> extraOverrides = const [],
  }) {
    return ProviderScope(
      overrides: [
        postRepositoryProvider.overrideWithValue(mockRepository),
        authStateProvider.overrideWith((ref) {
          return MockAuthStateNotifier(user);
        }),
        jwtProvider.overrideWith(
          (ref) async => user != null ? 'test-token' : null,
        ),
        ...extraOverrides,
      ],
      child: const MaterialApp(home: CreatePostScreen()),
    );
  }

  group('CreatePostScreen Widget Tests', () {
    group('Validation', () {
      testWidgets('shows character count', (tester) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Initial state shows max characters
        expect(
          find.textContaining('5000 characters remaining'),
          findsOneWidget,
        );
      });

      testWidgets('updates character count as user types', (tester) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Find the text field and enter some text
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Hello world');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Character count should update
        expect(
          find.textContaining('4989 characters remaining'),
          findsOneWidget,
        );
      });

      testWidgets('Post button is disabled when text is empty', (tester) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Find the Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        final button = tester.widget<FilledButton>(postButton);

        // Button should be disabled when text is empty
        expect(button.onPressed, isNull);
      });

      testWidgets('Post button is enabled with text and disclosure', (
        tester,
      ) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter some text
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Hello world');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Find the Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        final button = tester.widget<FilledButton>(postButton);

        // Button should be enabled
        expect(button.onPressed, isNotNull);
      });

      testWidgets('shows warning when approaching character limit', (
        tester,
      ) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text close to the limit (90% = 4500 chars)
        final longText = 'A' * 4600;
        final textField = find.byType(TextField);
        await tester.enterText(textField, longText);
        await tester.pump();

        // Character count should show remaining
        expect(find.textContaining('400 characters remaining'), findsOneWidget);
      });
    });

    group('Authentication', () {
      testWidgets('shows auth required message when not signed in', (
        tester,
      ) async {
        await tester.pumpWidget(createTestWidget(user: null));
        await tester.pumpAndSettle();

        // Should show auth required card
        expect(find.text('Please sign in to create a post.'), findsOneWidget);
      });

      testWidgets('text field is disabled when not signed in', (tester) async {
        await tester.pumpWidget(createTestWidget(user: null));
        await tester.pumpAndSettle();

        final textField = find.byType(TextField);
        final widget = tester.widget<TextField>(textField);
        expect(widget.enabled, isFalse);
      });

      testWidgets('text field is enabled when signed in', (tester) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        final textField = find.byType(TextField);
        final widget = tester.widget<TextField>(textField);
        expect(widget.enabled, isTrue);
      });
    });

    group('Form Submission', () {
      testWidgets('logs first post attempt when submit is tapped', (
        tester,
      ) async {
        when(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        ).thenAnswer(
          (_) async => CreatePostSuccess(
            Post(
              id: 'post-1',
              authorId: 'test-user-id',
              authorUsername: 'Tester',
              text: 'Hello world',
              createdAt: DateTime.parse('2026-02-01T00:00:00.000Z'),
              updatedAt: DateTime.parse('2026-02-01T00:00:00.000Z'),
              isNews: false,
            ),
          ),
        );

        final analytics = _RecordingAnalyticsClient();
        final tracker = _RecordingEventTracker();

        await tester.pumpWidget(
          createTestWidget(
            user: createTestUser(),
            extraOverrides: [
              analyticsClientProvider.overrideWithValue(analytics),
              analyticsEventTrackerProvider.overrideWithValue(tracker),
            ],
          ),
        );
        await tester.pumpAndSettle();

        await tester.enterText(find.byType(TextField).first, 'Hello world');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        await tester.tap(find.widgetWithText(FilledButton, 'Post'));
        await tester.pumpAndSettle();

        expect(tracker.onceEvents, contains(AnalyticsEvents.firstPostAttempt));
      });

      testWidgets('blocks submission on compromised device', (tester) async {
        final compromisedState = DeviceSecurityState(
          isRootedOrJailbroken: true,
          isEmulator: false,
          isDebugBuild: false,
          lastCheckedAt: DateTime.now(),
        );
        final guard = DeviceIntegrityGuard(
          deviceSecurityService: FakeDeviceSecurityService(compromisedState),
          config: const MobileSecurityConfig(
            tlsPins: TlsPinConfig(
              enabled: false,
              strictMode: true,
              spkiPinsBase64: [],
            ),
            strictDeviceIntegrity: true,
            blockRootedDevices: true,
          ),
          environment: Environment.production,
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              postRepositoryProvider.overrideWithValue(mockRepository),
              authStateProvider.overrideWith((ref) {
                return MockAuthStateNotifier(createTestUser());
              }),
              jwtProvider.overrideWith((ref) async => 'test-token'),
              deviceIntegrityGuardProvider.overrideWithValue(guard),
              deviceSecurityServiceProvider.overrideWithValue(
                FakeDeviceSecurityService(compromisedState),
              ),
              deviceSecurityStateProvider.overrideWith(
                (ref) async => compromisedState,
              ),
            ],
            child: const MaterialApp(
              home: _SecurityProviderWatcher(child: CreatePostScreen()),
            ),
          ),
        );

        await tester.pumpAndSettle();

        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Blocked post');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        await tester.tap(find.widgetWithText(FilledButton, 'Post'));
        await tester.pumpAndSettle();

        expect(find.text('Security Notice'), findsOneWidget);
        verifyNever(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        );
      });

      testWidgets('shows loading indicator when submitting', (tester) async {
        // Setup mock to return immediately (no delay to avoid timer issues)
        when(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        ).thenAnswer((_) async {
          return CreatePostSuccess(
            Post(
              id: 'test-id',
              authorId: 'test-user-id',
              authorUsername: 'testuser',
              text: 'Test post',
              createdAt: DateTime.now(),
            ),
          );
        });

        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text and submit
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Test post content');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Tap Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        await tester.tap(postButton);
        await tester.pump(); // One pump to start the request

        // The state should be submitting - check the button is disabled
        final button = tester.widget<FilledButton>(postButton);
        // Button should be disabled during submission (onPressed is null)
        expect(button.onPressed, isNull);

        // Finish the async work
        await tester.pumpAndSettle();
      });
    });

    group('Error Handling', () {
      testWidgets('shows content blocked banner when content is blocked', (
        tester,
      ) async {
        when(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        ).thenAnswer((_) async {
          return const CreatePostBlocked(
            message: 'Content violates community guidelines',
            categories: ['hate_speech', 'harassment'],
          );
        });

        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text and submit
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Inappropriate content');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Tap Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        await tester.tap(postButton);
        await tester.pumpAndSettle();

        // Should show content blocked banner
        expect(find.text('Content Blocked'), findsOneWidget);
        expect(
          find.text('Content violates community guidelines'),
          findsOneWidget,
        );
        expect(find.text('hate_speech'), findsOneWidget);
        expect(find.text('harassment'), findsOneWidget);
      });

      testWidgets('shows limit exceeded banner when daily limit reached', (
        tester,
      ) async {
        when(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        ).thenAnswer((_) async {
          return const CreatePostLimitExceeded(
            message: 'Daily post limit reached',
            limit: 10,
            currentCount: 10,
            tier: 'free',
            retryAfter: Duration(hours: 12),
          );
        });

        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text and submit
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'New post');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Tap Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        await tester.tap(postButton);
        await tester.pumpAndSettle();

        // Should show limit exceeded banner
        expect(find.text('Daily Limit Reached'), findsOneWidget);
        expect(find.textContaining('10 posts'), findsOneWidget);
      });

      testWidgets('shows error banner for generic errors', (tester) async {
        when(
          () => mockRepository.createPost(
            request: any(named: 'request'),
            token: any(named: 'token'),
          ),
        ).thenAnswer((_) async {
          return const CreatePostError(
            message: 'Network connection failed',
            code: 'network_error',
          );
        });

        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text and submit
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'New post');
        await tester.pump();
        await chooseHumanAuthorship(tester);

        // Tap Post button
        final postButton = find.widgetWithText(FilledButton, 'Post');
        await tester.tap(postButton);
        await tester.pumpAndSettle();

        // Should show error message
        expect(find.text('Network connection failed'), findsOneWidget);
      });
    });

    group('Discard Confirmation', () {
      testWidgets('shows discard dialog when closing with unsaved content', (
        tester,
      ) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Enter text
        final textField = find.byType(TextField);
        await tester.enterText(textField, 'Unsaved post content');
        await tester.pump();

        // Tap close button
        final closeButton = find.byIcon(Icons.close);
        await tester.tap(closeButton);
        await tester.pumpAndSettle();

        // Should show discard dialog
        expect(find.text('Discard post?'), findsOneWidget);
        expect(
          find.text('Your post will be lost if you close this screen.'),
          findsOneWidget,
        );
        expect(find.text('Keep editing'), findsOneWidget);
        expect(find.text('Discard'), findsOneWidget);
      });

      testWidgets('closes without dialog when text is empty', (tester) async {
        await tester.pumpWidget(createTestWidget(user: createTestUser()));
        await tester.pumpAndSettle();

        // Tap close button without entering text
        final closeButton = find.byIcon(Icons.close);
        await tester.tap(closeButton);
        await tester.pumpAndSettle();

        // Should not show discard dialog (screen should close)
        expect(find.text('Discard post?'), findsNothing);
      });
    });
  });

  group('PostCreationNotifier Unit Tests', () {
    test('updateText updates state', () {
      final container = ProviderContainer(
        overrides: [postRepositoryProvider.overrideWithValue(mockRepository)],
      );
      addTearDown(container.dispose);

      final notifier = container.read(postCreationProvider.notifier);

      notifier.updateText('Hello world');
      expect(container.read(postCreationProvider).text, 'Hello world');
    });

    test('validate returns error for empty text', () {
      final container = ProviderContainer(
        overrides: [postRepositoryProvider.overrideWithValue(mockRepository)],
      );
      addTearDown(container.dispose);

      final notifier = container.read(postCreationProvider.notifier);

      final error = notifier.validate();
      expect(error, 'Please enter some text for your post');
    });

    test('validate returns error for text exceeding max length', () {
      final container = ProviderContainer(
        overrides: [postRepositoryProvider.overrideWithValue(mockRepository)],
      );
      addTearDown(container.dispose);

      final notifier = container.read(postCreationProvider.notifier);

      notifier.updateText('A' * 5001);
      final error = notifier.validate();
      expect(error, 'Post text cannot exceed 5000 characters');
    });

    test('validate returns null for valid text', () {
      final container = ProviderContainer(
        overrides: [postRepositoryProvider.overrideWithValue(mockRepository)],
      );
      addTearDown(container.dispose);

      final notifier = container.read(postCreationProvider.notifier);

      notifier.updateText('Valid post content');
      notifier.setAiLabel('human');
      final error = notifier.validate();
      expect(error, isNull);
    });

    test('reset clears state', () {
      final container = ProviderContainer(
        overrides: [postRepositoryProvider.overrideWithValue(mockRepository)],
      );
      addTearDown(container.dispose);

      final notifier = container.read(postCreationProvider.notifier);

      notifier.updateText('Some text');
      notifier.updateMediaUrl('https://example.com/image.jpg');
      notifier.reset();

      final state = container.read(postCreationProvider);
      expect(state.text, '');
      expect(state.mediaUrl, isNull);
      expect(state.result, isNull);
    });
  });

  group('PostCreationState Tests', () {
    test('isValid returns false for empty text', () {
      const state = PostCreationState(text: '');
      expect(state.isValid, isFalse);
    });

    test('isValid returns false for whitespace-only text', () {
      const state = PostCreationState(text: '   ');
      expect(state.isValid, isFalse);
    });

    test('isValid returns true for valid text', () {
      const state = PostCreationState(text: 'Hello world', aiLabel: 'human');
      expect(state.isValid, isTrue);
    });

    test('isValid returns false for text exceeding max length', () {
      final state = PostCreationState(text: 'A' * 5001);
      expect(state.isValid, isFalse);
    });

    test('isSuccess returns true for CreatePostSuccess', () {
      final state = PostCreationState(
        result: CreatePostSuccess(
          Post(
            id: 'test',
            authorId: 'author',
            authorUsername: 'user',
            text: 'text',
            createdAt: DateTime.now(),
          ),
        ),
      );
      expect(state.isSuccess, isTrue);
      expect(state.isBlocked, isFalse);
      expect(state.hasError, isFalse);
    });

    test('isBlocked returns true for CreatePostBlocked', () {
      const state = PostCreationState(
        result: CreatePostBlocked(message: 'Blocked', categories: []),
      );
      expect(state.isBlocked, isTrue);
      expect(state.isSuccess, isFalse);
      expect(state.hasError, isFalse);
    });

    test('isLimitExceeded returns true for CreatePostLimitExceeded', () {
      const state = PostCreationState(
        result: CreatePostLimitExceeded(
          message: 'Limit',
          limit: 10,
          currentCount: 10,
          tier: 'free',
          retryAfter: Duration(hours: 24),
        ),
      );
      expect(state.isLimitExceeded, isTrue);
      expect(state.isSuccess, isFalse);
    });

    test('hasError returns true for CreatePostError', () {
      const state = PostCreationState(
        result: CreatePostError(message: 'Error'),
      );
      expect(state.hasError, isTrue);
      expect(state.isSuccess, isFalse);
    });
  });
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
  Future<void> continueAsGuest() async {
    state = const AsyncValue.data(null);
  }

  @override
  Future<void> validateToken() async {}
  @override
  void setUser(User user) {
    state = AsyncValue.data(user);
  }
}

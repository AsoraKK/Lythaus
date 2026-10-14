/// Widget tests for CreatePostScreen — targeting uncovered UI paths like
/// blocked banner, limit-exceeded banner, error banner, media URL chips,
/// auth-required card, proof tiles, and CreatePostFAB.
library;

import 'dart:async';

import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/services/appeal_provider.dart';

class MockPostRepository extends Mock implements PostRepository {}

class _SeededPostCreationNotifier extends PostCreationNotifier {
  _SeededPostCreationNotifier(super.ref, PostCreationState initial) : super() {
    state = initial;
  }
}

class _MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _MockAuthStateNotifier(User? user) : super(AsyncValue.data(user));
  @override
  Future<void> refreshToken() async {}
  @override
  Future<void> signInWithEmail(String email, String password) async {}
  @override
  Future<void> signOut() async => state = const AsyncValue.data(null);
  @override
  Future<void> validateToken() async {}
  @override
  Future<void> continueAsGuest() async {}
  @override
  void setUser(User user) {
    state = AsyncValue.data(user);
  }
}

typedef _AppealSubmitter =
    Future<bool> Function(String caseId, String statement);

class _TestAppealService extends AppealService {
  _TestAppealService(super.ref, this.submitter);

  final _AppealSubmitter? submitter;

  @override
  Future<bool> submit(String caseId, String statement) =>
      submitter?.call(caseId, statement) ?? Future.value(false);
}

User _testUser({String id = 'u1'}) => User(
  id: id,
  email: '$id@test.com',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 50,
  createdAt: DateTime(2024),
  lastLoginAt: DateTime(2024),
);

void main() {
  late MockPostRepository mockRepo;

  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fb'));
  });

  setUp(() => mockRepo = MockPostRepository());

  Widget buildWithState(
    PostCreationState state, {
    User? user,
    ThemeData? theme,
    double textScale = 1,
    _AppealSubmitter? appealSubmitter,
    Widget? home,
  }) {
    final canCreate = user != null;
    return ProviderScope(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        postRepositoryProvider.overrideWithValue(mockRepo),
        postCreationProvider.overrideWith(
          (ref) => _SeededPostCreationNotifier(ref, state),
        ),
        canCreatePostProvider.overrideWithValue(canCreate),
        authStateProvider.overrideWith((ref) => _MockAuthStateNotifier(user)),
        jwtProvider.overrideWith(
          (ref) async => user != null ? 'test-token' : null,
        ),
        appealProvider.overrideWith(
          (ref) => _TestAppealService(ref, appealSubmitter),
        ),
      ],
      child: MaterialApp(
        theme: theme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: home ?? const CreatePostScreen(),
      ),
    );
  }

  Future<void> openAppeal(WidgetTester tester) async {
    final appealButton = find.widgetWithText(TextButton, 'Appeal');
    await tester.ensureVisible(appealButton);
    await tester.tap(appealButton);
    await tester.pumpAndSettle();
  }

  Widget composerLauncher() => Builder(
    builder: (context) => Scaffold(
      body: Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push<void>(
            MaterialPageRoute<void>(builder: (_) => const CreatePostScreen()),
          ),
          child: const Text('Open composer'),
        ),
      ),
    ),
  );

  Future<void> launchComposer(WidgetTester tester) async {
    await tester.tap(find.text('Open composer'));
    await tester.pumpAndSettle();
  }

  Finder appealStatementField() => find.byWidgetPredicate(
    (widget) =>
        widget is TextField &&
        widget.decoration?.hintText ==
            'Briefly explain why this moderation case should be reviewed.',
  );

  const appealableBlockedState = PostCreationState(
    text: 'Blocked draft',
    result: CreatePostBlocked(
      message: 'Content blocked',
      categories: ['spam'],
      appealEligible: true,
      appealCaseId: 'case-1',
    ),
  );

  group('_ContentBlockedBanner', () {
    for (final dark in [false, true]) {
      testWidgets(
        'Your post label remains within the 390x900 scroll viewport, dark=$dark',
        (tester) async {
          tester.view.physicalSize = const Size(390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            buildWithState(
              const PostCreationState(),
              user: _testUser(),
              theme: dark ? LythausTheme.dark() : LythausTheme.light(),
            ),
          );
          await tester.pumpAndSettle();
          final label = tester.getRect(find.text('Your post'));
          final viewport = tester.getRect(
            find.byType(SingleChildScrollView).first,
          );
          expect(label.top, greaterThanOrEqualTo(viewport.top));
          expect(label.bottom, lessThan(viewport.bottom));
          expect(tester.takeException(), isNull);
        },
      );
    }
    for (final dark in [false, true]) {
      testWidgets('composer reflows at 320 pixels and 200% text, dark=$dark', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(320, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          buildWithState(
            const PostCreationState(
              text: 'A thoughtful contribution',
              aiLabel: 'assisted',
            ),
            user: _testUser(),
            theme: dark ? LythausTheme.dark() : LythausTheme.light(),
            textScale: 2,
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.drag(
          find.byType(SingleChildScrollView).first,
          const Offset(0, -1800),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Source attestation'), findsNothing);
        expect(find.text('Photos are not available yet'), findsOneWidget);
      });
    }
    testWidgets('renders blocked banner with categories', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'Bad content',
            result: CreatePostBlocked(
              message: 'Content violates community guidelines',
              categories: ['hate_speech', 'harassment'],
            ),
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Content Blocked'), findsOneWidget);
      expect(
        find.text('Content violates community guidelines'),
        findsOneWidget,
      );
      expect(find.text('hate_speech'), findsOneWidget);
      expect(find.text('harassment'), findsOneWidget);
    });

    testWidgets('renders blocked banner without categories', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'Bad content',
            result: CreatePostBlocked(
              message: 'Blocked by moderation',
              categories: [],
            ),
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Content Blocked'), findsOneWidget);
      expect(find.text('Blocked by moderation'), findsOneWidget);
    });
  });

  group('Case-gated appeal request', () {
    testWidgets('appeal action remains case-gated', (tester) async {
      for (final state in [
        const PostCreationState(
          text: 'Blocked draft',
          result: CreatePostBlocked(
            message: 'Content blocked',
            categories: [],
            appealCaseId: 'case-1',
          ),
        ),
        const PostCreationState(
          text: 'Blocked draft',
          result: CreatePostBlocked(
            message: 'Content blocked',
            categories: [],
            appealEligible: true,
            appealCaseId: '',
          ),
        ),
      ]) {
        await tester.pumpWidget(buildWithState(state, user: _testUser()));
        await tester.pumpAndSettle();
        expect(find.widgetWithText(TextButton, 'Appeal'), findsNothing);
      }
    });

    for (final dismissal in ['Cancel', 'Escape', 'Back']) {
      testWidgets('dismiss via $dismissal is silent and releases the guard', (
        tester,
      ) async {
        final submissions = <String>[];
        await tester.pumpWidget(
          buildWithState(
            appealableBlockedState,
            user: _testUser(),
            appealSubmitter: (caseId, statement) async {
              submissions.add('$caseId:$statement');
              return true;
            },
          ),
        );
        await tester.pumpAndSettle();

        await openAppeal(tester);
        expect(find.byType(AlertDialog), findsOneWidget);
        if (dismissal == 'Cancel') {
          await tester.tap(find.text('Cancel'));
        } else if (dismissal == 'Escape') {
          await tester.sendKeyEvent(LogicalKeyboardKey.escape);
        } else {
          await tester.binding.handlePopRoute();
        }
        await tester.pumpAndSettle();

        expect(find.byType(AlertDialog), findsNothing);
        expect(
          find.text('Please provide at least 10 characters for your appeal.'),
          findsNothing,
        );
        expect(submissions, isEmpty);

        await openAppeal(tester);
        expect(find.byType(AlertDialog), findsOneWidget);
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
      });
    }

    testWidgets('repeated opening creates only one appeal dialog', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(appealableBlockedState, user: _testUser()),
      );
      await tester.pumpAndSettle();
      final open = tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Appeal'))
          .onPressed!;

      open();
      open();
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await openAppeal(tester);
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('short statements still require ten characters', (
      tester,
    ) async {
      var submissions = 0;
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) async {
            submissions++;
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();
      await openAppeal(tester);
      await tester.enterText(appealStatementField(), 'Too short');
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();

      expect(
        find.text('Please provide at least 10 characters for your appeal.'),
        findsOneWidget,
      );
      expect(submissions, 0);
    });

    testWidgets('guard remains through submission and clears after response', (
      tester,
    ) async {
      final started = Completer<void>();
      final response = Completer<bool>();
      final submissions = <String>[];
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) {
            submissions.add('$caseId:$statement');
            if (!started.isCompleted) started.complete();
            return response.future;
          },
        ),
      );
      await tester.pumpAndSettle();
      final open = tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Appeal'))
          .onPressed!;
      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'This case was incorrectly blocked.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      await started.future;

      open();
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(submissions, ['case-1:This case was incorrectly blocked.']);

      response.complete(true);
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'Appeal submitted for independent trained-reviewer',
        ),
        findsOneWidget,
      );
      await openAppeal(tester);
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('service errors leave the appeal available for retry', (
      tester,
    ) async {
      var attempts = 0;
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) async {
            attempts++;
            if (attempts == 1) throw StateError('temporary network failure');
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();

      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'Please review this moderation decision.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      expect(
        find.text('Failed to submit appeal. Please try again.'),
        findsOneWidget,
      );
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();

      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'Please review this moderation decision.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      expect(attempts, 2);
      expect(
        find.textContaining(
          'Appeal submitted for independent trained-reviewer',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('late appeal response after account change is ignored', (
      tester,
    ) async {
      final started = Completer<void>();
      final response = Completer<bool>();
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) {
            if (!started.isCompleted) started.complete();
            return response.future;
          },
        ),
      );
      await tester.pumpAndSettle();
      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'Please review this moderation decision.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      await started.future;

      ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      ).read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();
      response.complete(true);
      await tester.pumpAndSettle();

      expect(
        find.textContaining(
          'Appeal submitted for independent trained-reviewer',
        ),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('account change closes appeal without submitting it', (
      tester,
    ) async {
      final submissions = <String>[];
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) async {
            submissions.add('$caseId:$statement');
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      );
      final startingEpoch = container
          .read(contentMutationRegistryProvider)
          .sessionEpoch;
      await openAppeal(tester);

      container.read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();

      expect(
        container.read(contentMutationRegistryProvider).sessionEpoch,
        greaterThan(startingEpoch),
      );
      expect(find.byType(AlertDialog), findsNothing);
      expect(submissions, isEmpty);
      expect(
        find.text('Please provide at least 10 characters for your appeal.'),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('account change before the first frame removes the appeal', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(appealableBlockedState, user: _testUser()),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      );
      final open = tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Appeal'))
          .onPressed!;

      open();
      container.read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('account change removes appeal below a newer route', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          home: composerLauncher(),
        ),
      );
      await launchComposer(tester);
      await openAppeal(tester);
      final composerContext = tester.element(find.byType(CreatePostScreen));
      final navigator = Navigator.of(composerContext);
      final container = ProviderScope.containerOf(composerContext);
      final cover = navigator.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Cover route')),
        ),
      );
      await tester.pumpAndSettle();

      container.read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();
      final coverStayedOnTop = find.text('Cover route').evaluate().isNotEmpty;

      navigator.pop();
      await tester.pumpAndSettle();
      await cover;

      expect(coverStayedOnTop, isTrue);
      expect(find.byType(CreatePostScreen), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(
        ModalRoute.of(tester.element(find.byType(CreatePostScreen)))?.isCurrent,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('account change releases a pending appeal for composer close', (
      tester,
    ) async {
      final started = Completer<void>();
      final response = Completer<bool>();
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          home: composerLauncher(),
          appealSubmitter: (caseId, statement) {
            if (!started.isCompleted) started.complete();
            return response.future;
          },
        ),
      );
      await launchComposer(tester);
      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'Please review this moderation decision.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      await started.future;

      ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      ).read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();
      final close = tester
          .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.close))
          .onPressed!;
      close();
      await tester.pumpAndSettle();
      final composerClosedWhileRequestPending = find
          .text('Open composer')
          .evaluate()
          .isNotEmpty;

      response.complete(true);
      await tester.pumpAndSettle();
      expect(composerClosedWhileRequestPending, isTrue);
      expect(find.byType(CreatePostScreen), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('old appeal completion cannot unlock a newer policy dialog', (
      tester,
    ) async {
      final started = Completer<void>();
      final response = Completer<bool>();
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          home: composerLauncher(),
          appealSubmitter: (caseId, statement) {
            if (!started.isCompleted) started.complete();
            return response.future;
          },
        ),
      );
      await launchComposer(tester);
      await openAppeal(tester);
      await tester.enterText(
        appealStatementField(),
        'Please review this moderation decision.',
      );
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      await started.future;

      ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      ).read(authStateProvider.notifier).setUser(_testUser(id: 'u2'));
      await tester.pumpAndSettle();
      final policyButton = find.widgetWithText(TextButton, 'Posting policy');
      await tester.ensureVisible(policyButton);
      await tester.tap(policyButton);
      await tester.pumpAndSettle();
      final policyOpenedWhileRequestPending =
          find.byType(AlertDialog).evaluate().length == 1;

      response.complete(true);
      await tester.pumpAndSettle();
      final openPolicy = tester.widget<TextButton>(policyButton).onPressed!;
      openPolicy();
      await tester.pumpAndSettle();
      final dialogsAfterOldCompletion = find
          .byType(AlertDialog)
          .evaluate()
          .length;

      for (var count = 0; count < 2; count++) {
        final done = find.text('Done');
        if (done.evaluate().isEmpty) break;
        await tester.tap(done.last);
        await tester.pumpAndSettle();
      }
      final close = tester
          .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.close))
          .onPressed!;
      close();
      await tester.pumpAndSettle();

      expect(policyOpenedWhileRequestPending, isTrue);
      expect(dialogsAfterOldCompletion, 1);
      expect(find.text('Open composer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('disposing the composer removes its route-local appeal only', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          home: composerLauncher(),
        ),
      );
      await launchComposer(tester);
      await openAppeal(tester);
      final composerContext = tester.element(find.byType(CreatePostScreen));
      final navigator = Navigator.of(composerContext);
      final composerRoute = ModalRoute.of(composerContext)!;
      final cover = navigator.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Disposal cover')),
        ),
      );
      await tester.pumpAndSettle();

      navigator.removeRoute(composerRoute);
      await tester.pumpAndSettle();
      final coverStayedOnTop = find
          .text('Disposal cover')
          .evaluate()
          .isNotEmpty;
      final appealWasRemoved = find.byType(AlertDialog).evaluate().isEmpty;
      navigator.pop();
      await tester.pumpAndSettle();
      await cover;

      expect(coverStayedOnTop, isTrue);
      expect(appealWasRemoved, isTrue);
      expect(find.text('Open composer'), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('disposing the composer releases appeal dialog resources', (
      tester,
    ) async {
      var submissions = 0;
      await tester.pumpWidget(
        buildWithState(
          appealableBlockedState,
          user: _testUser(),
          appealSubmitter: (caseId, statement) async {
            submissions++;
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();
      await openAppeal(tester);

      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: Text('Composer closed'))),
      );
      await tester.pumpAndSettle();

      expect(find.text('Composer closed'), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(submissions, 0);
      expect(tester.takeException(), isNull);
    });
  });

  group('_LimitExceededBanner', () {
    testWidgets('renders limit exceeded banner with hours', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'Some post text',
            result: CreatePostLimitExceeded(
              message: 'Daily limit reached',
              limit: 5,
              currentCount: 5,
              tier: 'free',
              retryAfter: Duration(hours: 2, minutes: 30),
            ),
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Daily Limit Reached'), findsOneWidget);
      expect(find.textContaining('2h 30m'), findsOneWidget);
      expect(find.textContaining('free tier'), findsOneWidget);
    });

    testWidgets('renders limit exceeded with minutes only', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'Some post text',
            result: CreatePostLimitExceeded(
              message: 'Daily limit reached',
              limit: 3,
              currentCount: 3,
              tier: 'bronze',
              retryAfter: Duration(minutes: 45),
            ),
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Daily Limit Reached'), findsOneWidget);
      expect(find.textContaining('45m'), findsOneWidget);
    });
  });

  group('_ErrorBanner', () {
    testWidgets('renders error banner for generic error', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'content',
            result: CreatePostError(
              message: 'Network connection failed',
              code: 'network_error',
            ),
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Network connection failed'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });
  });

  group('_AuthRequiredCard', () {
    testWidgets('shows auth required card when user is null', (tester) async {
      await tester.pumpWidget(buildWithState(const PostCreationState()));
      await tester.pumpAndSettle();

      expect(find.text('Please sign in to create a post.'), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    });
  });

  group('Deferred media UI', () {
    testWidgets('does not expose media attachments in the launch UI', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(
            text: 'Hello world',
            mediaUrl: 'https://example.com/image.png',
            contentType: 'image',
          ),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.image_outlined), findsNothing);
      expect(
        find.byWidgetPredicate(
          (w) => w is Text && (w.data ?? '').contains('example.com'),
        ),
        findsNothing,
      );
    });
  });

  testWidgets('member composer explains gates and keeps policy accessible', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      buildWithState(
        const PostCreationState(text: 'Hello world', aiLabel: 'human'),
        user: _testUser(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Capture metadata hash'), findsNothing);
    expect(find.text('Edit history hash'), findsNothing);
    expect(find.text('Source attestation'), findsNothing);
    expect(find.text('Photos are not available yet'), findsOneWidget);
    expect(
      find.textContaining('does not mean AI assessment has completed'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Posting policy'));
    await tester.tap(find.text('Posting policy'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('AI-generated public content is not allowed.'),
      findsOneWidget,
    );
    expect(
      find.textContaining('249 user-perceived characters'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 390.0]) {
    testWidgets(
      'posting policy remains reachable at $width pixels with large text and keyboard',
      (tester) async {
        tester.view.physicalSize = Size(width, 640);
        tester.view.devicePixelRatio = 1;
        tester.view.viewInsets = const FakeViewPadding(bottom: 280);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpWidget(
          buildWithState(
            const PostCreationState(text: 'Hello world', aiLabel: 'human'),
            user: _testUser(),
            textScale: 2,
          ),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Posting policy'));
        await tester.tap(find.text('Posting policy'));
        await tester.pumpAndSettle();

        expect(
          find.textContaining('249 user-perceived characters'),
          findsOneWidget,
        );
        expect(find.text('Done').hitTestable(), findsOneWidget);
        final policyContent = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(SingleChildScrollView),
        );
        expect(policyContent, findsOneWidget);
        final policyScrollable = find.descendant(
          of: policyContent,
          matching: find.byType(Scrollable),
        );
        expect(policyScrollable, findsOneWidget);
        final scrollState = tester.state<ScrollableState>(policyScrollable);
        expect(scrollState.position.maxScrollExtent, greaterThan(0));
        await tester.drag(policyScrollable, const Offset(0, -300));
        await tester.pumpAndSettle();
        expect(scrollState.position.pixels, greaterThan(0));
        expect(find.text('Done').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('policy Done, Escape and Back restore focus and preserve draft', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildWithState(
        const PostCreationState(text: 'Draft for review', aiLabel: 'assisted'),
        user: _testUser(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Posting policy'));
    final policyFocus = Focus.of(tester.element(find.text('Posting policy')));
    policyFocus.requestFocus();
    await tester.pump();

    for (final dismiss in ['Done', 'Escape', 'Back']) {
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      if (dismiss == 'Done') {
        await tester.tap(find.text('Done'));
      } else if (dismiss == 'Escape') {
        await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      } else {
        await tester.binding.handlePopRoute();
      }
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(policyFocus.hasPrimaryFocus, isTrue);
    }
    final container = ProviderScope.containerOf(
      tester.element(find.byType(CreatePostScreen)),
    );
    expect(container.read(postCreationProvider).text, 'Draft for review');
    expect(container.read(postCreationProvider).aiLabel, 'assisted');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'repeated policy and Close activations open one dialog and retain draft',
    (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(text: 'Unsent draft', aiLabel: 'human'),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Posting policy'));
      final openPolicy = tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Posting policy'))
          .onPressed!;
      openPolicy();
      openPolicy();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done').last);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);

      final close = tester
          .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.close))
          .onPressed!;
      close();
      close();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep editing').last);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.byType(CreatePostScreen), findsOneWidget);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      );
      expect(container.read(postCreationProvider).text, 'Unsent draft');
      expect(container.read(postCreationProvider).aiLabel, 'human');
      expect(tester.takeException(), isNull);
    },
  );

  group('CreatePostFAB', () {
    testWidgets('renders FAB with Post label', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            canCreatePostProvider.overrideWithValue(true),
          ],
          child: const MaterialApp(
            home: Scaffold(floatingActionButton: CreatePostFAB()),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Post'), findsOneWidget);
      expect(find.byIcon(Icons.edit), findsOneWidget);
    });

    testWidgets('shows snackbar when not signed in', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            canCreatePostProvider.overrideWithValue(false),
          ],
          child: const MaterialApp(
            home: Scaffold(floatingActionButton: CreatePostFAB()),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Post'));
      await tester.pumpAndSettle();

      expect(find.text('Please sign in to create a post'), findsOneWidget);
    });
  });

  group('Submitting state', () {
    testWidgets('shows spinner in Post button while submitting', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(text: 'Valid text', isSubmitting: true),
          user: _testUser(),
        ),
      );
      // Don't use pumpAndSettle — CircularProgressIndicator never settles
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('Character counter', () {
    testWidgets('shows character count', (tester) async {
      await tester.pumpWidget(
        buildWithState(
          const PostCreationState(text: 'Hello'),
          user: _testUser(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('5/5000'), findsOneWidget);
    });
  });
}

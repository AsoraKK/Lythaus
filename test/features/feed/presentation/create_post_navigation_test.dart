import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';

import '../../../helpers/content_recovery.dart';

class _Repository extends Mock implements PostRepository {}

class _Guard extends Mock implements DeviceIntegrityGuard {}

class _Feed extends LiveFeedController {
  _Feed() : super(const LiveFeedState(isInitialLoading: false));

  @override
  Future<void> refresh() async {}

  @override
  Future<void> loadMore() async {}
}

final _actor = StateProvider<User?>((_) => _user('owner'));

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

CreatePostSuccess _accepted(String state) => CreatePostSuccess(
  domain.Post(
    id: 'synthetic-post',
    authorId: 'owner',
    authorUsername: 'Synthetic owner',
    text: 'Synthetic submission',
    createdAt: DateTime.utc(2026),
    moderationState: state,
  ),
);

void main() {
  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fallback'));
    registerFallbackValue(IntegrityUseCase.postContent);
  });

  Future<({GoRouter router, ProviderContainer container, _Repository repo})>
  setup(WidgetTester tester, {bool pushed = false}) async {
    final repo = _Repository();
    final guard = _Guard();
    when(
      () => guard.evaluate(any()),
    ).thenAnswer((_) async => DeviceIntegrityDecision.allow());
    final router = GoRouter(
      initialLocation: '/?tab=create&source=synthetic',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => pushed
              ? Scaffold(
                  body: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const CreatePostScreen(),
                      ),
                    ),
                    child: const Text('Open composer'),
                  ),
                )
              : AdaptiveShell(
                  initialIndex: switch (state.uri.queryParameters['tab']) {
                    'create' => 1,
                    'profile' => 2,
                    'rewards' => 3,
                    _ => 0,
                  },
                ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          currentUserProvider.overrideWith((ref) => ref.watch(_actor)),
          canCreatePostProvider.overrideWithValue(true),
          jwtProvider.overrideWith((ref) async => ref.watch(_actor)?.id),
          postRepositoryProvider.overrideWithValue(repo),
          ownerProfileProvider.overrideWith(
            (ref) async => throw StateError('Synthetic profile unavailable'),
          ),
          deviceIntegrityGuardProvider.overrideWithValue(guard),
          analyticsClientProvider.overrideWithValue(
            const NullAnalyticsClient(),
          ),
          feedListProvider.overrideWithValue(const [
            FeedModel(
              id: 'discover',
              name: 'Discover',
              type: FeedType.discover,
              contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
              sorting: SortingRule.hot,
              refinements: FeedRefinements(),
              subscriptionLevelRequired: 0,
              isHome: true,
            ),
          ]),
          liveFeedStateProvider.overrideWith((ref, _) => _Feed()),
          liveFeedItemsProvider.overrideWith((ref, _) async => []),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    if (pushed) {
      await tester.tap(find.text('Open composer'));
      await tester.pumpAndSettle();
    }
    final container = ProviderScope.containerOf(
      tester.element(find.byType(CreatePostScreen)),
    );
    await tester.enterText(
      find.byType(TextField).first,
      'Synthetic submission',
    );
    await tester.tap(find.text('Human-authored'));
    await tester.pumpAndSettle();
    return (router: router, container: container, repo: repo);
  }

  for (final state in ['under_review', 'allowed']) {
    testWidgets('root Create tab accepts $state without removing the shell', (
      tester,
    ) async {
      final fixture = await setup(tester);
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _accepted(state));
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(AdaptiveShell), findsOneWidget);
      expect(
        fixture.router.routeInformationProvider.value.uri.queryParameters,
        {'tab': 'discover', 'source': 'synthetic'},
      );
      expect(
        find.text(
          state == 'allowed'
              ? 'Post created successfully!'
              : 'Post submitted. Publication checks are pending.',
        ),
        findsOneWidget,
      );
      expect(fixture.container.read(postCreationProvider).text, isEmpty);
      expect(
        find.textContaining(
          'Choose Human-authored or AI-assisted before posting.',
        ),
        findsNothing,
      );
      verify(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).called(1);
    });
  }

  testWidgets(
    'validation feedback removes the policy overlay and keeps draft',
    (tester) async {
      final fixture = await setup(tester);
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async =>
            const CreatePostError(message: 'Synthetic validation failed'),
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Synthetic validation failed'), findsOneWidget);
      expect(
        find.textContaining(
          'Choose Human-authored or AI-assisted before posting.',
        ),
        findsNothing,
      );
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      expect(
        fixture
            .router
            .routeInformationProvider
            .value
            .uri
            .queryParameters['tab'],
        'create',
      );
    },
  );

  testWidgets('pushed composer returns to its caller after accepted pending', (
    tester,
  ) async {
    final fixture = await setup(tester, pushed: true);
    when(
      () => fixture.repo.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _accepted('under_review'));
    await tester.tap(find.widgetWithText(FilledButton, 'Post'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Open composer'), findsOneWidget);
    expect(find.byType(CreatePostScreen), findsNothing);
  });

  testWidgets(
    'duplicate Post and Close during slow submission wait for receipt',
    (tester) async {
      final fixture = await setup(tester);
      final response = Completer<CreatePostResult>();
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => response.future);
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pump();
      expect(find.byType(CreatePostScreen), findsOneWidget);
      verify(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).called(1);
      response.complete(_accepted('under_review'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        fixture
            .router
            .routeInformationProvider
            .value
            .uri
            .queryParameters['tab'],
        'discover',
      );
    },
  );

  testWidgets(
    'account switch fences late success and preserves new actor draft',
    (tester) async {
      final fixture = await setup(tester);
      final response = Completer<CreatePostResult>();
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => response.future);
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pump();
      fixture.container.read(_actor.notifier).state = _user('other');
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField).first,
        'New actor private draft',
      );
      response.complete(_accepted('under_review'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        fixture
            .router
            .routeInformationProvider
            .value
            .uri
            .queryParameters['tab'],
        'create',
      );
      expect(
        find.text('Post submitted. Publication checks are pending.'),
        findsNothing,
      );
      expect(
        fixture.container.read(postCreationProvider).text,
        'New actor private draft',
      );
    },
  );

  testWidgets('Close on an empty root composer retains the routed shell', (
    tester,
  ) async {
    final fixture = await setup(tester);
    fixture.container.read(postCreationProvider.notifier).reset();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Close composer'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(AdaptiveShell), findsOneWidget);
    expect(
      fixture.router.routeInformationProvider.value.uri.queryParameters['tab'],
      'discover',
    );
  });

  testWidgets(
    'uncertain Close retains the same payload and key when reopened',
    (tester) async {
      final fixture = await setup(tester);
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => const CreatePostError(
          message: 'Submission unconfirmed',
          outcomeUncertain: true,
        ),
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pumpAndSettle();
      final registry = fixture.container.read(contentMutationRegistryProvider);
      final attempt = registry.pending('post-create:owner')!;
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pumpAndSettle();
      fixture.router.go('/?tab=create&source=synthetic');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(registry.pending(attempt.scope)!.key, attempt.key);
      expect(registry.pending(attempt.scope)!.payload, attempt.payload);
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      expect(
        fixture.container
            .read(postCreationProvider)
            .errorResult
            ?.outcomeUncertain,
        isTrue,
      );
    },
  );

  testWidgets(
    'discard on root composer requires confirmation and retains shell',
    (tester) async {
      final fixture = await setup(tester);
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        fixture
            .router
            .routeInformationProvider
            .value
            .uri
            .queryParameters['tab'],
        'discover',
      );
      expect(find.byType(AdaptiveShell), findsOneWidget);
      expect(fixture.container.read(postCreationProvider).text, isEmpty);
    },
  );

  testWidgets('late accepted receipt leaves a page above composer in place', (
    tester,
  ) async {
    final fixture = await setup(tester);
    final response = Completer<CreatePostResult>();
    when(
      () => fixture.repo.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) => response.future);
    await tester.tap(find.widgetWithText(FilledButton, 'Post'));
    await tester.pump();
    unawaited(
      Navigator.of(tester.element(find.byType(CreatePostScreen))).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Another page')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    response.complete(_accepted('under_review'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Another page'), findsOneWidget);
    expect(fixture.container.read(postCreationProvider).text, isEmpty);
  });

  testWidgets('late receipt preserves the active Profile tab and route', (
    tester,
  ) async {
    final fixture = await setup(tester);
    final response = Completer<CreatePostResult>();
    when(
      () => fixture.repo.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) => response.future);
    await tester.tap(find.widgetWithText(FilledButton, 'Post'));
    await tester.pump();
    fixture.router.go('/?tab=profile&source=synthetic');
    await tester.pumpAndSettle();
    expect(find.text('Unable to load profile'), findsOneWidget);
    expect(fixture.container.read(postCreationProvider).isSubmitting, isTrue);
    final activeRoute = fixture.router.routeInformationProvider.value.uri;
    response.complete(_accepted('under_review'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(fixture.router.routeInformationProvider.value.uri, activeRoute);
    expect(find.text('Unable to load profile'), findsOneWidget);
    expect(find.byType(CreatePostScreen), findsNothing);
    expect(fixture.container.read(postCreationProvider).text, isEmpty);
    expect(
      fixture.container
          .read(contentMutationRegistryProvider)
          .pending('post-create:owner'),
      isNull,
    );
    verify(
      () => fixture.repo.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    ).called(1);
  });

  testWidgets(
    'native Back on dirty root confirms discard and preserves cancel',
    (tester) async {
      final fixture = await setup(tester);
      final activeRoute = fixture.router.routeInformationProvider.value.uri;
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Discard post?'), findsOneWidget);
      expect(fixture.router.routeInformationProvider.value.uri, activeRoute);
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(find.text('Discard post?'), findsNothing);
      expect(fixture.router.routeInformationProvider.value.uri, activeRoute);
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(AdaptiveShell), findsOneWidget);
      expect(
        fixture.router.routeInformationProvider.value.uri.queryParameters,
        {'tab': 'discover', 'source': 'synthetic'},
      );
      expect(fixture.container.read(postCreationProvider).text, isEmpty);
      verifyNever(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      );
    },
  );

  testWidgets(
    'native Back during submission preserves frozen draft and route',
    (tester) async {
      final fixture = await setup(tester);
      final response = Completer<CreatePostResult>();
      when(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => response.future);
      await tester.tap(find.widgetWithText(FilledButton, 'Post'));
      await tester.pump();
      final activeRoute = fixture.router.routeInformationProvider.value.uri;
      final registry = fixture.container.read(contentMutationRegistryProvider);
      final attempt = registry.pending('post-create:owner')!;
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(find.text('Discard post?'), findsNothing);
      expect(fixture.router.routeInformationProvider.value.uri, activeRoute);
      expect(fixture.container.read(postCreationProvider).isSubmitting, isTrue);
      expect(
        fixture.container.read(postCreationProvider).text,
        'Synthetic submission',
      );
      expect(registry.pending(attempt.scope)!.key, attempt.key);
      expect(registry.pending(attempt.scope)!.payload, attempt.payload);
      response.complete(_accepted('under_review'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        fixture
            .router
            .routeInformationProvider
            .value
            .uri
            .queryParameters['tab'],
        'discover',
      );
      verify(
        () => fixture.repo.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).called(1);
    },
  );
}

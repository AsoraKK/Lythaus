import 'dart:ui' show Tristate;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';

import '../../../helpers/content_recovery.dart';

const _owner = '018f0000-0000-7000-8000-000000000001';
const _bodies = [
  'Published garden update',
  'Private draft awaiting review',
  'A note for followers',
];
final _posts = [
  for (var index = 0; index < _bodies.length; index++)
    OwnerPost(
      id: '01900000-0000-7000-8000-00000000000${index + 1}',
      authorId: _owner,
      body: _bodies[index],
      declaredCreationMode: 'human',
      moderationState: index == 1 ? 'under_review' : 'allowed',
      visibility: ['public', 'private', 'followers'][index],
      publishedAt: index == 1 ? null : DateTime.utc(2026, 10, 1),
      createdAt: DateTime.utc(2026, 10, 1),
      updatedAt: DateTime.utc(2026, 10, 1),
    ),
];

class _Posts extends OwnerPostsService {
  _Posts() : super(Dio());
  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => OwnerPostsPage(items: _posts, nextCursor: null);
}

class _Repository extends Mock implements PostRepository {}

class _Session extends StateNotifier<Object?> {
  _Session() : super(null);
}

Future<GoRouter> _pump(WidgetTester tester, double width) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final repository = _Repository();
  when(
    () => repository.getPost(
      postId: any(named: 'postId'),
      token: any(named: 'token'),
    ),
  ).thenAnswer((invocation) async {
    final post = _posts.firstWhere(
      (p) => p.id == invocation.namedArguments[#postId],
    );
    return domain.Post(
      id: post.id,
      authorId: _owner,
      authorUsername: 'Casey Member',
      text: post.body,
      createdAt: post.createdAt,
      moderationState: post.moderationState,
      declaredCreationMode: 'human',
    );
  });
  final router = GoRouter(
    initialLocation: '/?tab=profile&profileTab=posts&origin=keyboard-caller',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => const AdaptiveShell(initialIndex: 2),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        currentUserProvider.overrideWithValue(
          User(
            id: _owner,
            email: 'owner@example.invalid',
            role: UserRole.user,
            tier: UserTier.bronze,
            reputationScore: 0,
            createdAt: DateTime.utc(2026),
            lastLoginAt: DateTime.utc(2026),
          ),
        ),
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(_Session()),
        ),
        jwtProvider.overrideWith((ref) async => 'synthetic-token'),
        ownerProfileProvider.overrideWith(
          (ref) async => const OwnerProfile(
            user: PublicUser(
              id: _owner,
              displayName: 'Casey Member',
              tier: 'bronze',
            ),
            moderationState: 'allowed',
            publicVisibility: true,
          ),
        ),
        ownerPostsServiceProvider.overrideWithValue(_Posts()),
        settingsProvider.overrideWith((ref) => SettingsController()),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        postRepositoryProvider.overrideWithValue(repository),
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        reputationProvider.overrideWith(
          (ref) async => const ReputationState(
            userId: _owner,
            level: 0,
            levelName: 'Member',
            reputationStatus: 'active',
            reputationBand: 'Getting started',
            policyVersion: 'synthetic',
            pillars: {},
            promotionBlockers: [],
          ),
        ),
        monthlyRewardsViewProvider.overrideWith(
          (ref) async => throw StateError('Synthetic unavailable'),
        ),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Finder _button(int index) => find.ancestor(
  of: find.text(_bodies[index]),
  matching: find.byType(TextButton),
);

void main() {
  for (final width in [320.0, 390.0, 1440.0]) {
    testWidgets('$width: each post has one named button action', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      try {
        await _pump(tester, width);
        for (var index = 0; index < _posts.length; index++) {
          expect(_button(index), findsOneWidget);
          final node = tester.getSemantics(_button(index));
          final data = node.getSemanticsData();
          expect(data.flagsCollection.isButton, isTrue);
          expect(data.flagsCollection.isFocused, isNot(Tristate.none));
          expect(data.hasAction(SemanticsAction.tap), isTrue);
          expect(data.label, contains('Open post'));
          expect(data.label, contains(_bodies[index]));
          expect(data.label, contains(_posts[index].statusLabel));
          expect(data.label, isNot(contains(_posts[index].id)));
          node.visitChildren((child) {
            expect(
              child.getSemanticsData().hasAction(SemanticsAction.tap),
              isFalse,
            );
            return true;
          });
        }
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });

    testWidgets('$width: Tab, Shift+Tab, Enter and Space preserve caller', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      try {
        final router = await _pump(tester, width);
        final origin = router.routeInformationProvider.value.uri;
        Focus.of(
          tester.element(find.widgetWithText(Tab, 'Posts')),
        ).requestFocus();
        await tester.pump();
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
        expect(
          tester
                  .getSemantics(find.widgetWithText(Tab, 'Comments'))
                  .getSemanticsData()
                  .flagsCollection
                  .isFocused ==
              Tristate.isTrue,
          isTrue,
        );
        for (var index = 0; index < _posts.length; index++) {
          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          await tester.pumpAndSettle();
          expect(
            tester
                    .getSemantics(_button(index))
                    .getSemanticsData()
                    .flagsCollection
                    .isFocused ==
                Tristate.isTrue,
            isTrue,
          );
        }
        await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
        await tester.pumpAndSettle();
        expect(
          tester
                  .getSemantics(_button(1))
                  .getSemanticsData()
                  .flagsCollection
                  .isFocused ==
              Tristate.isTrue,
          isTrue,
        );
        final scrollable = tester.state<ScrollableState>(
          find.descendant(
            of: find.byKey(const PageStorageKey('profile-posts-$_owner')),
            matching: find.byType(Scrollable),
          ),
        );
        final offset = scrollable.position.pixels;
        for (final key in [
          LogicalKeyboardKey.enter,
          LogicalKeyboardKey.space,
        ]) {
          await tester.sendKeyEvent(key);
          await tester.pumpAndSettle();
          expect(find.byType(PostDetailScreen), findsOneWidget);
          expect(find.text(_bodies[1]), findsOneWidget);
          await tester.pageBack();
          await tester.pumpAndSettle();
          expect(find.byType(PostDetailScreen), findsNothing);
          expect(router.routeInformationProvider.value.uri, origin);
          expect(scrollable.position.pixels, closeTo(offset, 1));
          expect(
            tester
                    .getSemantics(_button(1))
                    .getSemanticsData()
                    .flagsCollection
                    .isFocused ==
                Tristate.isTrue,
            isTrue,
          );
        }
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }
}

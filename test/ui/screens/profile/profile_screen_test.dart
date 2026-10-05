/// Widget tests for ProfileScreen.
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

const _fakeUser = PublicUser(
  id: 'user-1',
  displayName: 'Jane Doe',
  handle: '@janedoe',
  tier: 'silver',
);

const _ownerVisibleUser = PublicUser(
  id: 'user-1',
  displayName: 'Jane Doe',
  handle: '@janedoe',
  tier: 'gold',
  journalistVerified: true,
  badges: ['Trusted', 'Editor'],
  trustPassportVisibility: 'public_expanded',
  reputationScore: 321,
);

const _otherUser = PublicUser(
  id: 'user-2',
  displayName: 'Private Person',
  handle: '@private',
  tier: 'bronze',
  reputationScore: 12,
);

const _fakeReputationState = ReputationState(
  userId: 'user-1',
  level: 2,
  levelName: 'Trusted contributor',
  reputationStatus: 'active',
  reputationBand: 'Constructive participation',
  policyVersion: 'reputation-policy-v1',
  pillars: <String, String>{
    'constructiveParticipation': 'strong',
    'accountability': 'strong',
    'governance': 'developing',
  },
  promotionBlockers: <String>[],
);

final _fakeAuthUser = User(
  id: 'user-1',
  email: 'jane@example.com',
  role: UserRole.user,
  tier: UserTier.silver,
  reputationScore: 100,
  createdAt: DateTime.utc(2024),
  lastLoginAt: DateTime.utc(2024),
);

final _fakeAdminUser = _fakeAuthUser.copyWith(role: UserRole.admin);

class _FakeOwnerPostsService extends OwnerPostsService {
  _FakeOwnerPostsService({OwnerPostsPage? page, this.failuresRemaining = 0})
    : page = page ?? const OwnerPostsPage(items: [], nextCursor: null),
      super(Dio());

  final OwnerPostsPage page;
  int failuresRemaining;
  int requests = 0;

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async {
    requests++;
    if (failuresRemaining > 0) {
      failuresRemaining--;
      throw StateError('Synthetic timeline failure');
    }
    return page;
  }
}

OwnerPost _post({
  required String id,
  required String body,
  String moderationState = 'allowed',
  String visibility = 'public',
  DateTime? publishedAt,
}) => OwnerPost(
  id: id,
  authorId: 'user-1',
  body: body,
  declaredCreationMode: 'human',
  moderationState: moderationState,
  visibility: visibility,
  publishedAt: publishedAt,
  createdAt: DateTime.utc(2026, 10, 5),
  updatedAt: DateTime.utc(2026, 10, 5),
);

Widget _buildApp({List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: ProfileScreen()),
  );
}

OwnerProfile _ownerProfile(PublicUser user) => OwnerProfile(
  user: user,
  moderationState: 'allowed',
  publicVisibility: true,
);

Future<void> _scrollTo(WidgetTester tester, Finder target) async {
  await tester.scrollUntilVisible(
    target,
    280,
    scrollable: find.byType(Scrollable).first,
  );
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  // ── No user signed in ──────────────────────────────────────────────────────
  group('No signed-in user', () {
    testWidgets('shows sign-in prompt when no userId and no current user', (
      tester,
    ) async {
      await tester.pumpWidget(
        _buildApp(overrides: [currentUserProvider.overrideWithValue(null)]),
      );
      await tester.pump();

      expect(
        find.text('Sign in to view your profile details.'),
        findsOneWidget,
      );
    });

    testWidgets('shows Profile AppBar when no user', (tester) async {
      await tester.pumpWidget(
        _buildApp(overrides: [currentUserProvider.overrideWithValue(null)]),
      );
      await tester.pump();

      expect(find.text('Profile'), findsOneWidget);
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  group('Loading state', () {
    testWidgets('shows CircularProgressIndicator while profile loads', (
      tester,
    ) async {
      final completer = Completer<PublicUser>();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) => completer.future.then(_ownerProfile),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      completer.complete(_fakeUser);
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────
  group('Error state', () {
    testWidgets('shows error message when profile load fails', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => throw Exception('Network failure'),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Unable to load profile'), findsOneWidget);
    });
  });

  // ── Success state ──────────────────────────────────────────────────────────
  group('Success state', () {
    testWidgets('shows displayName in AppBar', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_fakeUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Jane Doe'), findsAtLeastNWidgets(1));
    });

    testWidgets('shows handle label', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_fakeUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('@janedoe'), findsOneWidget);
    });

    testWidgets('shows honest published and pending posts with pagination', (
      tester,
    ) async {
      final service = _FakeOwnerPostsService(
        page: OwnerPostsPage(
          items: [
            _post(
              id: 'post-1',
              body: 'A published synthetic post',
              publishedAt: DateTime.utc(2026, 10, 5),
            ),
            _post(
              id: 'post-2',
              body: 'A private post under review',
              moderationState: 'under_review',
              visibility: 'private',
            ),
          ],
          nextCursor: 'next-page',
        ),
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_fakeUser),
            ),
            ownerPostsServiceProvider.overrideWithValue(service),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Your posts'), findsOneWidget);
      expect(find.text('Published'), findsOneWidget);
      expect(find.text('Awaiting review'), findsOneWidget);
      expect(find.text('Load more posts'), findsOneWidget);
      expect(find.textContaining('A short bio can add context'), findsOneWidget);
      await tester.ensureVisible(find.text('A private post under review'));
      expect(find.text('A private post under review'), findsOneWidget);
      expect(find.text('Only you can see this while it is under review.'), findsOneWidget);
    });

    testWidgets('post timeline recovers from a load error', (tester) async {
      final service = _FakeOwnerPostsService(failuresRemaining: 1);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_fakeUser),
            ),
            ownerPostsServiceProvider.overrideWithValue(service),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Unable to load your posts. Your profile is still available.'), findsOneWidget);
      await tester.tap(find.text('Retry posts'));
      await tester.pumpAndSettle();
      expect(find.text('You have not posted yet. Your posts will appear here after you share them.'), findsOneWidget);
      expect(service.requests, 2);
    });

    testWidgets('owner sees profile actions but not staff tools by default', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_ownerVisibleUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Subscription: gold'), findsOneWidget);
      expect(find.text('Editorial Contributor'), findsNothing);
      expect(find.text('Trusted'), findsNothing);
      expect(find.text('Editor'), findsNothing);
      expect(find.text('Moderation hub'), findsNothing);
      expect(find.text('Control Panel'), findsNothing);
      await _scrollTo(tester, find.text('Settings'));
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Reputation'), findsNothing);
    });

    testWidgets('admin owner sees staff tools', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAdminUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_ownerVisibleUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      await _scrollTo(tester, find.text('Moderation hub'));
      expect(find.text('Moderation hub'), findsOneWidget);
      expect(find.text('Control Panel'), findsNothing);
      expect(find.text('Reputation'), findsNothing);
    });

    testWidgets('deferred Trust Passport surface is not rendered', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_ownerVisibleUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Trust Passport'), findsNothing);
      expect(find.text('Appeals outcomes'), findsNothing);
      expect(find.textContaining('Juror'), findsNothing);
    });

    testWidgets('owner profile actions open their destination routes', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            ownerPostsServiceProvider.overrideWithValue(
              _FakeOwnerPostsService(),
            ),
            ownerProfileProvider.overrideWith(
              (ref) async => _ownerProfile(_ownerVisibleUser),
            ),
            jwtProvider.overrideWith((ref) async => 'tok'),
            reputationProvider.overrideWith(
              (ref) async => _fakeReputationState,
            ),
          ],
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      await tester.pumpAndSettle();

      final completeProfile = find.text('Complete your profile');
      await _scrollTo(tester, completeProfile);
      await tester.tap(completeProfile);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Edit profile'), findsAtLeastNWidgets(1));
      await tester.pageBack();
      await tester.pumpAndSettle();

      await _scrollTo(tester, find.text('Settings'));
      await tester.tap(find.text('Settings'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Settings'), findsWidgets);
    });

    testWidgets('non-owner does not receive deferred trust surfaces', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWithValue(_fakeAuthUser),
            publicUserProvider(
              'user-2',
            ).overrideWith((ref) async => _otherUser),
            jwtProvider.overrideWith((ref) async => 'tok'),
          ],
          child: const MaterialApp(home: ProfileScreen(userId: 'user-2')),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Private Person'), findsWidgets);
      expect(find.text('Your posts'), findsNothing);
      expect(find.textContaining('Trust Passport'), findsNothing);
      expect(find.text('Reputation'), findsNothing);
    });
  });
}

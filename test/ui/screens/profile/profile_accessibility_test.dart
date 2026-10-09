import 'dart:async';
import 'dart:ui' show SemanticsAction;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/presentation/presentation_preferences_section.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

final _owner = User(
  id: 'owner-1',
  email: 'owner@example.test',
  role: UserRole.user,
  tier: UserTier.silver,
  reputationScore: 0,
  createdAt: DateTime.utc(2024),
  lastLoginAt: DateTime.utc(2024),
);

const _ownerProfile = OwnerProfile(
  user: PublicUser(id: 'owner-1', displayName: '', tier: 'silver'),
  moderationState: 'allowed',
  publicVisibility: true,
);

const _reputation = ReputationState(
  userId: 'owner-1',
  level: 0,
  levelName: 'New contributor',
  reputationStatus: 'active',
  reputationBand: 'Getting started',
  policyVersion: 'synthetic-policy',
  pillars: <String, String>{},
  promotionBlockers: <String>[],
);

class _EmptyOwnerPostsService extends OwnerPostsService {
  _EmptyOwnerPostsService() : super(Dio());

  @override
  Future<OwnerPostsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) async => const OwnerPostsPage(items: [], nextCursor: null);
}

List<Override> _profileOverrides(
  Future<OwnerProfile> Function(Ref ref) loadProfile,
) => [
  currentUserProvider.overrideWithValue(_owner),
  ownerProfileProvider.overrideWith(loadProfile),
  ownerPostsServiceProvider.overrideWithValue(_EmptyOwnerPostsService()),
  jwtProvider.overrideWith((ref) async => 'synthetic-token'),
  reputationProvider.overrideWith((ref) async => _reputation),
  monthlyRewardsViewProvider.overrideWith((ref) async {
    throw StateError('Synthetic monthly status unavailable');
  }),
];

Widget _profileApp(Future<OwnerProfile> Function(Ref ref) loadProfile) =>
    ProviderScope(
      overrides: _profileOverrides(loadProfile),
      child: const MaterialApp(home: ProfileScreen()),
    );

void main() {
  testWidgets('profile loading status is announced to screen readers', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final pending = Completer<OwnerProfile>();

    await tester.pumpWidget(_profileApp((_) => pending.future));
    await tester.pump();

    final loading = find.bySemanticsLabel('Loading profile');
    expect(loading, findsOneWidget);
    expect(tester.getSemantics(loading).flagsCollection.isLiveRegion, isTrue);

    pending.complete(_ownerProfile);
    await tester.pumpAndSettle();
    semantics.dispose();
  });

  testWidgets('profile error exposes an accessible retry that recovers', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    var requests = 0;

    await tester.pumpWidget(
      _profileApp((_) async {
        requests++;
        if (requests == 1) throw StateError('Synthetic profile failure');
        return _ownerProfile;
      }),
    );
    await tester.pumpAndSettle();

    expect(find.text('Unable to load profile'), findsOneWidget);
    final retry = find.bySemanticsLabel('Retry');
    expect(retry, findsOneWidget);
    expect(
      tester
          .getSemantics(retry)
          .getSemanticsData()
          .hasAction(SemanticsAction.tap),
      isTrue,
    );

    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(requests, greaterThan(1));
    expect(find.text('Your profile'), findsOneWidget);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets(
    'owner profile refresh and settings tools have accessible actions',
    (tester) async {
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(_profileApp((_) async => _ownerProfile));
      await tester.pumpAndSettle();

      final refresh = find.byTooltip('Refresh profile');
      expect(refresh, findsOneWidget);
      final refreshButton = tester
          .getSemantics(find.byType(IconButton).first)
          .getSemanticsData();
      expect(refreshButton.tooltip, 'Refresh profile');
      expect(refreshButton.hasAction(SemanticsAction.tap), isTrue);

      final settings = find.widgetWithText(ListTile, 'Settings');
      await tester.scrollUntilVisible(
        settings,
        280,
        scrollable: find
            .descendant(
              of: find.byType(ListView).first,
              matching: find.byType(Scrollable),
            )
            .first,
      );
      final settingsSemantics = tester
          .getSemantics(settings)
          .getSemanticsData();
      expect(settingsSemantics.label, contains('Settings'));
      expect(settingsSemantics.hasAction(SemanticsAction.tap), isTrue);
      semantics.dispose();
    },
  );

  testWidgets('preference save announces saving instead of loading', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final pendingSave = Completer<PresentationPreferences>();
    var saveAttempts = 0;
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(_owner),
        settingsProvider.overrideWith(
          (ref) => SettingsController(
            ownerId: _owner.id,
            load: () async => const PresentationPreferences(),
            save: (preferences, key) {
              saveAttempts++;
              return pendingSave.future;
            },
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: PresentationPreferencesSection(),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final swipe = find.widgetWithText(
      SwitchListTile,
      'Swipe between profile tabs',
    );
    await tester.ensureVisible(swipe);
    await tester.tap(swipe);
    await tester.pump();

    final saveButton = find.widgetWithText(FilledButton, 'Save preferences');
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pump();

    final saving = find.bySemanticsLabel('Saving preferences');
    expect(saving, findsOneWidget);
    expect(tester.getSemantics(saving).flagsCollection.isLiveRegion, isTrue);
    expect(find.bySemanticsLabel('Loading saved preferences'), findsNothing);
    expect(find.text('Saving preferences…'), findsOneWidget);
    expect(saveAttempts, 1);

    pendingSave.complete(
      const PresentationPreferences(horizontalSwipeEnabled: false),
    );
    await tester.pumpAndSettle();
    semantics.dispose();
  });

  testWidgets(
    'unavailable account preferences are announced and cannot be saved',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final pending = Completer<PresentationPreferences?>();
      var saveAttempts = 0;
      final container = ProviderContainer(
        overrides: [
          currentUserProvider.overrideWithValue(_owner),
          settingsProvider.overrideWith(
            (ref) => SettingsController(
              ownerId: _owner.id,
              load: () => pending.future,
              save: (preferences, key) async {
                saveAttempts++;
                return preferences;
              },
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: PresentationPreferencesSection(),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      final loading = find.bySemanticsLabel('Loading saved preferences');
      expect(loading, findsOneWidget);
      expect(tester.getSemantics(loading).flagsCollection.isLiveRegion, isTrue);

      pending.complete(null);
      await tester.pumpAndSettle();

      final unavailable = find.bySemanticsLabel(
        'Account preferences are not available yet.',
      );
      expect(unavailable, findsOneWidget);
      expect(
        tester.getSemantics(unavailable).flagsCollection.isLiveRegion,
        isTrue,
      );
      for (final label in [
        'Swipe between profile tabs',
        'Left-handed mode (mirror nav)',
      ]) {
        final tile = find.widgetWithText(SwitchListTile, label);
        expect(tester.widget<SwitchListTile>(tile).onChanged, isNull);
      }
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save preferences'),
            )
            .onPressed,
        isNull,
      );
      expect(find.text('Saved to your account.'), findsNothing);
      expect(saveAttempts, 0);
      semantics.dispose();
    },
  );
}

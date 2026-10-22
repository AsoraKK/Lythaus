import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/routing/app_router.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import '../helpers/content_recovery.dart';
import '../helpers/feed_session.dart';

class _FixtureFeed extends LiveFeedController {
  _FixtureFeed(FeedModel feed)
    : super(
        LiveFeedState(
          isInitialLoading: Uri.base.queryParameters['scenario'] == 'loading',
          errorMessage: Uri.base.queryParameters['scenario'] == 'error'
              ? 'Synthetic connection failure'
              : null,
          items:
              [
                'empty',
                'loading',
                'error',
              ].contains(Uri.base.queryParameters['scenario'])
              ? []
              : [
                  FeedItem(
                    id: '018f0000-0000-7000-8000-000000000002',
                    feedId: feed.id,
                    author: 'Rowan Ellis',
                    authorId: '018f0000-0000-7000-8000-000000000003',
                    contentType: ContentType.image,
                    title: 'A little more room to grow',
                    body:
                        'The community garden is opening its gates this weekend. Neighbours have spent the spring turning an unused corner into a shared space for growing, learning and gathering. Everyone is welcome to bring a seedling, ask a question, or simply enjoy a quiet moment outside.',
                    imageUrl: '${Uri.base.origin}/fixture.png',
                    publishedAt: DateTime.utc(2026, 10, 22, 9, 30),
                    authorshipLabel: 'Human-authored',
                    classificationSource: 'user_disclosure',
                  ),
                  FeedItem(
                    id: '018f0000-0000-7000-8000-000000000004',
                    feedId: feed.id,
                    author: 'Kai Rivers',
                    authorId: '018f0000-0000-7000-8000-000000000005',
                    contentType: ContentType.text,
                    title: '',
                    body:
                        'A reminder from today’s walk: good public spaces give us room to pause, read and talk to one another.',
                    publishedAt: DateTime.utc(2026, 10, 22, 8),
                    authorshipLabel: 'Human-authored',
                    classificationSource: 'user_disclosure',
                  ),
                ],
        ),
      );
  @override
  Future<void> refresh() async {}
  @override
  Future<void> loadMore() async {}
}

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;
  final guest = Uri.base.queryParameters['actor'] == 'guest';
  final tier = Uri.base.queryParameters['tier'] ?? 'black';
  final dio = Dio(BaseOptions(baseUrl: '${Uri.base.origin}/api'));
  runApp(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith(
          (ref) => FeedTestAuth(guest ? null : feedTestUser('fixture-reader')),
        ),
        guestModeProvider.overrideWith((ref) => guest),
        jwtProvider.overrideWith(
          (ref) async => guest ? null : 'synthetic-reader',
        ),
        secureDioProvider.overrideWithValue(dio),
        socialFeedServiceProvider.overrideWithValue(SocialFeedService(dio)),
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        settingsProvider.overrideWith((ref) => SettingsController()),
        feedEntitlementsProvider.overrideWith(
          (ref) async => guest
              ? null
              : FeedEntitlements(
                  tier: tier,
                  maxCustomFeeds: tier == 'black'
                      ? 3
                      : tier == 'premium'
                      ? 2
                      : 1,
                  newsBoardAccess: tier == 'black' ? 'full' : 'none',
                ),
        ),
        customFeedsProvider.overrideWith(
          (ref) async => guest
              ? []
              : [
                  const FeedModel(
                    id: 'garden',
                    name: 'My neighbourhood',
                    type: FeedType.custom,
                    contentFilters: ContentFilters(
                      allowedTypes: {ContentType.mixed},
                    ),
                    sorting: SortingRule.newest,
                    refinements: FeedRefinements(),
                    subscriptionLevelRequired: 0,
                    isCustom: true,
                  ),
                ],
        ),
        liveFeedStateProvider.overrideWith((ref, feed) => _FixtureFeed(feed)),
      ],
      child: const _Fixture(),
    ),
  );
}

class _Fixture extends ConsumerWidget {
  const _Fixture();
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
    title: 'Lythaus feed · synthetic QA',
    theme: LythausTheme.light(),
    darkTheme: LythausTheme.dark(),
    themeMode: Uri.base.queryParameters['theme'] == 'dark'
        ? ThemeMode.dark
        : ThemeMode.light,
    routerConfig: ref.watch(appRouterProvider),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: true,
        textScaler: TextScaler.linear(
          double.tryParse(Uri.base.queryParameters['textScale'] ?? '') ?? 1,
        ),
      ),
      child: child!,
    ),
  );
}

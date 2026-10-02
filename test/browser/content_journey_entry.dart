import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';

const discover = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.hot,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
  isHome: true,
);
final fixtureActorProvider = StateProvider<String>(
  (_) => Uri.base.queryParameters['actor'] ?? 'owner',
);
@JS('lythausSyntheticActor')
external set fixtureSession(JSFunction value);

class FixtureFeed extends LiveFeedController {
  FixtureFeed(this.dio) : super(const LiveFeedState(isInitialLoading: true)) {
    unawaited(refresh());
  }
  final Dio dio;
  @override
  Future<void> refresh() async {
    final response = await dio.get<Map<String, dynamic>>('/api/feed/discover');
    state = LiveFeedState(
      isInitialLoading: false,
      items: [
        for (final item
            in (response.data?['items'] as List? ?? [])
                .cast<Map<String, dynamic>>())
          FeedItem(
            id: item['id'] as String,
            feedId: 'discover',
            author: 'Synthetic owner',
            authorId: item['authorId'] as String,
            contentType: ContentType.text,
            title: item['body'] as String,
            body: item['body'] as String,
            authorshipLabel: 'Human-authored',
            publishedAt: DateTime.utc(2026, 10, 1),
          ),
      ],
    );
  }

  @override
  Future<void> loadMore() async {}
}

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;
  final dio = Dio(
    BaseOptions(
      baseUrl: Uri.base.origin,
      headers: {
        'X-Synthetic-Case': Uri.base.queryParameters['case'] ?? 'default',
        'X-Synthetic-Scenario': Uri.base.queryParameters['scenario'] ?? '',
      },
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method != 'GET') {
          final record = jsonEncode({
            'method': options.method,
            'path': options.path,
            'body': options.data is Map ? options.data : <String, dynamic>{},
            'key': options.headers['Idempotency-Key'] ?? '',
          });
          debugPrint('SYNTHETIC-CONTENT-WRITE $record');
        }
        handler.next(options);
      },
    ),
  );
  runApp(
    ProviderScope(
      overrides: [
        currentUserProvider.overrideWith((ref) {
          final actor = ref.watch(fixtureActorProvider);
          return actor == 'guest'
              ? null
              : User(
                  id: actor,
                  email: '$actor@example.invalid',
                  role: UserRole.user,
                  tier: UserTier.bronze,
                  reputationScore: 0,
                  createdAt: DateTime.utc(2026),
                  lastLoginAt: DateTime.utc(2026),
                );
        }),
        canCreatePostProvider.overrideWith(
          (ref) => ref.watch(currentUserProvider) != null,
        ),
        jwtProvider.overrideWith((ref) async {
          final actor = ref.watch(fixtureActorProvider);
          return actor == 'guest' ? null : 'synthetic-$actor';
        }),
        secureDioProvider.overrideWithValue(dio),
        postRepositoryProvider.overrideWithValue(PostRepositoryImpl(dio)),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        feedListProvider.overrideWithValue(const [discover]),
        liveFeedStateProvider.overrideWith((ref, feed) => FixtureFeed(dio)),
      ],
      child: const FixtureApp(),
    ),
  );
}

class FixtureApp extends ConsumerWidget {
  const FixtureApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(contentMutationRegistryProvider);
    fixtureSession = ((JSString actor) {
      ref.read(fixtureActorProvider.notifier).state = actor.toDart;
    }).toJS;
    return MaterialApp(
      title: 'Lythaus content journey synthetic QA',
      debugShowCheckedModeBanner: false,
      theme: Uri.base.queryParameters['theme'] == 'dark'
          ? LythausTheme.dark()
          : LythausTheme.light(),
      home: Builder(
        builder: (context) => Scaffold(
          appBar: AppBar(title: const Text('Synthetic journey QA')),
          body: Column(
            children: [
              for (final entry in <String, Widget>{
                'Open composer': const CreatePostScreen(),
                'Open comments': const CommentThreadScreen(postId: 'p1'),
                'Open post': const PostDetailScreen(postId: 'p1'),
                'Open Discover': const HomeFeedNavigator(),
              }.entries)
                TextButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(builder: (_) => entry.value),
                  ),
                  child: Text(entry.key),
                ),
              TextButton(
                onPressed: () =>
                    ref.read(fixtureActorProvider.notifier).state = 'guest',
                child: const Text('Sign out synthetic session'),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(fixtureActorProvider.notifier).state = 'owner',
                child: const Text('Restore synthetic owner'),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(fixtureActorProvider.notifier).state = 'other',
                child: const Text('Switch synthetic account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

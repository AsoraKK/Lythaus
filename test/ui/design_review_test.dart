import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';
import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';

class _ReviewPostRepository extends Mock implements PostRepository {}

class _ReviewNotificationApi extends Mock implements NotificationApiService {}

class _ReviewDio extends Mock implements Dio {}

class _ReviewFeed extends LiveFeedController {
  _ReviewFeed()
    : super(const LiveFeedState(items: [], isInitialLoading: false));

  @override
  Future<void> loadMore() async {}

  @override
  Future<void> refresh() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    GoogleFonts.config.allowRuntimeFetching = false;
    final loader = FontLoader('Manrope');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      loader.addFont(rootBundle.load('assets/fonts/Manrope-$weight.ttf'));
    }
    await loader.load();
    final icons = FontLoader('MaterialIcons');
    icons.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    registerFallbackValue(Options());
  });

  const feeds = [
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
  ];
  const rewards = RewardsSnapshot(
    subscriptionTier: 'free',
    reputationLevel: 0,
    reputationBand: 'new',
    availableRewardLevels: [],
    maxOptionsPerLevel: 0,
    redemptionStatus: 'active',
    fraudRiskStatus: 'normal',
    offers: [],
    redemptionHistory: [],
    affiliateDisclosure: '',
  );

  for (final width in [320.0, 390.0, 768.0, 1024.0, 1440.0]) {
    for (final dark in [false, true]) {
      for (final entry in <String, Widget>{
        'feed': const AdaptiveShell(),
        'settings': const SettingsScreen(),
        'security': const AccountSecurityScreen(),
        'rewards': const RewardsDashboardScreen(),
        'post': const PostDetailScreen(postId: 'fixture-post'),
        'profile': const ProfileScreen(userId: 'fixture-author'),
        'notifications': const NotificationsScreen(),
        'notification-settings': const NotificationsSettingsScreen(),
        'appeals': const AppealHistoryScreen(),
        'receipt': const Scaffold(
          body: ReceiptDrawerSheet(postId: 'fixture-post'),
        ),
      }.entries) {
        testWidgets('${entry.key} ${width.toInt()} ${dark ? 'dark' : 'light'}', (
          tester,
        ) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 900);
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final boundaryKey = GlobalKey();
          final posts = _ReviewPostRepository();
          when(
            () => posts.getPost(postId: 'fixture-post', token: null),
          ).thenAnswer(
            (_) async => domain.Post(
              id: 'fixture-post',
              authorId: 'fixture-author',
              authorUsername: 'example_contributor',
              text:
                  'A thoughtful conversation begins with a clear question.\n\nThis is a development fixture for reading, authorship and recovery states.',
              createdAt: DateTime.utc(2026, 9, 26),
            ),
          );
          final api = _ReviewNotificationApi();
          when(
            () => api.getNotifications(
              limit: any(named: 'limit'),
              continuationToken: any(named: 'continuationToken'),
            ),
          ).thenAnswer(
            (_) async => const NotificationsListResponse(
              notifications: [],
              totalUnread: 0,
            ),
          );
          when(() => api.getUnreadCount()).thenAnswer((_) async => 0);
          when(() => api.getPreferences()).thenAnswer(
            (_) async => UserNotificationPreferences(
              userId: 'fixture-author',
              timezone: 'Africa/Johannesburg',
              quietHours: QuietHours.defaultQuietHours,
              categories: const CategoryPreferences(
                social: true,
                news: false,
                marketing: false,
              ),
              updatedAt: DateTime.utc(2026, 9, 26),
            ),
          );
          when(
            () => api.getDevices(activeOnly: true),
          ).thenAnswer((_) async => []);
          final dio = _ReviewDio();
          when(
            () => dio.get<Map<String, dynamic>>(
              any(),
              options: any(named: 'options'),
            ),
          ).thenAnswer(
            (_) async => Response(
              requestOptions: RequestOptions(path: '/fixture'),
              statusCode: 200,
              data: {
                'postId': 'fixture-post',
                'events': <Map<String, dynamic>>[],
              },
            ),
          );
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                guestModeProvider.overrideWith((ref) => true),
                currentUserProvider.overrideWithValue(null),
                jwtProvider.overrideWith((ref) async => null),
                postRepositoryProvider.overrideWithValue(posts),
                notificationApiServiceProvider.overrideWithValue(api),
                secureDioProvider.overrideWithValue(dio),
                publicUserProvider.overrideWith(
                  (ref, id) async => PublicUser(
                    id: id,
                    displayName: 'An example contributor with a long name',
                    handle: '@example_contributor',
                    tier: 'free',
                    avatarUrl: 'https://example.invalid/unavailable-avatar.png',
                    bio:
                        'Synthetic profile used to inspect readable identity, biography and subscription labels. No personal data.',
                  ),
                ),
                feedListProvider.overrideWith((ref) => feeds),
                liveFeedStateProvider.overrideWith((ref, _) => _ReviewFeed()),
                liveFeedItemsProvider.overrideWith((ref, _) async => []),
                rewardsSnapshotProvider.overrideWith((ref) async => rewards),
              ],
              child: MaterialApp(
                theme: dark ? LythausTheme.dark() : LythausTheme.light(),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    disableAnimations: true,
                    textScaler: width == 320
                        ? const TextScaler.linear(2)
                        : TextScaler.noScaling,
                  ),
                  child: RepaintBoundary(key: boundaryKey, child: child!),
                ),
                home: entry.value,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          final output = Platform.environment['LYTHAUS_UI_EVIDENCE'];
          if (output != null) {
            final boundary =
                boundaryKey.currentContext!.findRenderObject()
                    as RenderRepaintBoundary;
            await tester.runAsync(() async {
              final image = await boundary.toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await Directory(output).create(recursive: true);
              await File(
                '$output/${entry.key}-${width.toInt()}-${dark ? 'dark' : 'light'}.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        });
      }
    }
  }
}

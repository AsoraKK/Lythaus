import 'dart:ui' as ui;
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/content_recovery.dart';

class _CommentDio extends Mock implements Dio {}

User _owner() => User(
  id: 'semantics-owner',
  email: 'semantics@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Response<Map<String, dynamic>> _emptyComments() => Response<Map<String, dynamic>>(
  data: {'items': <Map<String, dynamic>>[]},
  statusCode: 200,
  requestOptions: RequestOptions(path: '/comments'),
);

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
  });

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    registerFallbackValue(Options());
  });

  testWidgets('feed post actions expose a named tappable button target', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      final router = GoRouter(
        initialLocation: '/feed',
        routes: [
          GoRoute(
            path: '/feed',
            builder: (context, state) => Scaffold(
              body: FeedCard(
                item: FeedItem(
                  id: 'semantics-post',
                  feedId: 'home',
                  author: 'Member',
                  authorId: 'semantics-member',
                  contentType: ContentType.text,
                  title: 'A feed post',
                  body: 'Local fixture content.',
                  publishedAt: DateTime.utc(2026),
                  tags: const [],
                ),
              ),
            ),
          ),
          GoRoute(
            name: 'profile',
            path: '/user/:userId',
            builder: (context, state) => const Scaffold(body: Text('Profile')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      final action = find.byTooltip('Post actions');
      final node = tester.getSemantics(action);
      expect(node.getSemanticsData().tooltip, 'Post actions');
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.getSemanticsData().hasAction(ui.SemanticsAction.tap), isTrue);
      final button = find.ancestor(
        of: action,
        matching: find.byWidgetPredicate(
          (widget) => widget is PopupMenuButton<String>,
        ),
      );
      expect(tester.getSize(button).shortestSide, greaterThanOrEqualTo(48));
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('comment composer exposes a labeled text field and send button', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final dio = _CommentDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) async => _emptyComments());
    try {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            secureDioProvider.overrideWithValue(dio),
            currentUserProvider.overrideWithValue(_owner()),
            jwtProvider.overrideWith((ref) async => 'synthetic-token'),
          ],
          child: const MaterialApp(
            home: CommentThreadScreen(postId: 'semantics-post'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final field = tester.getSemantics(find.bySemanticsLabel('Write a reply'));
      expect(field.label, 'Write a reply');
      expect(field.flagsCollection.isTextField, isTrue);

      final send = find.bySemanticsLabel('Send reply');
      final node = tester.getSemantics(send);
      expect(node.label, 'Send reply');
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.getSemanticsData().hasAction(ui.SemanticsAction.tap), isTrue);
      final button = find.ancestor(of: send, matching: find.byType(FilledButton));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('comment reply semantics remain usable at 200% text on compact viewports', (
    tester,
  ) async {
    final viewports = [
      const Size(320, 640),
      const Size(320, 900),
      const Size(390, 844),
    ];
    final overflowErrors = <String>[];
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final screenshotKey = GlobalKey();
    final semantics = tester.ensureSemantics();
    final dio = _CommentDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) async => _emptyComments());
    try {
      for (final viewport in viewports) {
        tester.view.physicalSize = viewport;
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              contentRecoveryStorageProvider.overrideWithValue(
                MemoryContentRecoveryStorage(),
              ),
              secureDioProvider.overrideWithValue(dio),
              currentUserProvider.overrideWithValue(_owner()),
              jwtProvider.overrideWith((ref) async => 'synthetic-token'),
            ],
            child: RepaintBoundary(
              key: screenshotKey,
              child: MaterialApp(
                theme: LythausTheme.light(),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: const TextScaler.linear(2),
                  ),
                  child: child!,
                ),
                home: const CommentThreadScreen(postId: 'semantics-post'),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.runAsync(() async {
          final boundary = screenshotKey.currentContext!.findRenderObject()!
              as RenderRepaintBoundary;
          final image = await boundary.toImage(pixelRatio: 1);
          try {
            final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
            final name = 'comment-thread-${viewport.width.toInt()}x${viewport.height.toInt()}-200pct.png';
            await File('review/screenshots/$name')
                .writeAsBytes(bytes!.buffer.asUint8List());
          } finally {
            image.dispose();
          }
        });

        final fieldFinder = find.bySemanticsLabel('Write a reply');
        final sendFinder = find.bySemanticsLabel('Send reply');
        await tester.ensureVisible(fieldFinder);
        expect(tester.getSemantics(fieldFinder).flagsCollection.isTextField, isTrue);
        final send = tester.getSemantics(sendFinder);
        expect(send.label, 'Send reply');
        expect(send.flagsCollection.isButton, isTrue);
        expect(send.getSemanticsData().hasAction(ui.SemanticsAction.tap), isTrue);
        expect(
          tester.getSize(find.ancestor(of: sendFinder, matching: find.byType(FilledButton))).height,
          greaterThanOrEqualTo(48),
        );
        expect(find.bySemanticsLabel('Write a reply'), findsOneWidget);
        expect(find.bySemanticsLabel('Send reply'), findsOneWidget);
        final error = tester.takeException();
        if (error != null) overflowErrors.add('$viewport: $error');
      }
      expect(overflowErrors, isEmpty, reason: overflowErrors.join('\n'));
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('rewards failure presents a named enabled retry button', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            rewardsSnapshotProvider.overrideWith(
              (ref, _) => Future.error(StateError('Synthetic load failure')),
            ),
          ],
          child: const MaterialApp(home: RewardsDashboardScreen()),
        ),
      );
      await tester.pumpAndSettle();

      final retry = find.text('Retry');
      final node = tester.getSemantics(retry);
      expect(node.label, 'Retry');
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.getSemanticsData().hasAction(ui.SemanticsAction.tap), isTrue);
      final button = find.ancestor(of: retry, matching: find.byType(FilledButton));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
    } finally {
      semantics.dispose();
    }
  });
}

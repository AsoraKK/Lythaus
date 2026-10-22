import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';

import '../../../helpers/content_recovery.dart';

class _HistoryAdapter implements HttpClientAdapter {
  _HistoryAdapter({
    required this.appealEnabled,
    required this.hasAppeal,
    this.unavailable = false,
  });
  final bool appealEnabled;
  final bool hasAppeal;
  final bool unavailable;
  final requests = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options.path);
    final receipt = options.path.endsWith('/receipt');
    final data = receipt
        ? {
            'postId': 'post-1',
            'events': [
              {
                'id': 'history-event',
                'type': 'MODERATION_ACTIONED',
                'summary': 'Review recorded',
                'reason': 'Synthetic review history',
                'actions': [
                  {
                    'key': 'APPEAL',
                    'label': 'View appeal information',
                    'enabled': appealEnabled,
                  },
                ],
              },
              if (hasAppeal)
                {
                  'id': 'appeal-event',
                  'type': 'APPEAL_OPENED',
                  'summary': 'Appeal recorded',
                },
            ],
          }
        : {
            'id': 'post-1',
            'authorId': 'other-member',
            'authorDisplayName': 'Kai Rivers',
            'body': 'A member update',
            'publicLabel': 'Human-authored',
            'moderationState': 'allowed',
            'declaredCreationMode': 'human',
            'createdAt': '2026-10-12T00:00:00Z',
          };
    return ResponseBody.fromString(
      jsonEncode(receipt && unavailable ? {'error': 'not_found'} : data),
      receipt && unavailable ? 404 : 200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  for (final detail in [false, true]) {
    final surface = detail ? 'post detail' : 'feed';
    for (final gate in [
      (enabled: true, hasAppeal: false),
      (enabled: false, hasAppeal: false),
      (enabled: true, hasAppeal: true),
    ]) {
      testWidgets('$surface history opens and preserves appeal gates $gate', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(390, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final adapter = _HistoryAdapter(
          appealEnabled: gate.enabled,
          hasAppeal: gate.hasAppeal,
        );
        final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1'))
          ..httpClientAdapter = adapter;
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              secureDioProvider.overrideWithValue(dio),
              contentRecoveryStorageProvider.overrideWithValue(
                MemoryContentRecoveryStorage(),
              ),
              currentUserProvider.overrideWithValue(
                User(
                  id: 'viewer',
                  email: 'viewer@example.invalid',
                  role: UserRole.user,
                  tier: UserTier.bronze,
                  reputationScore: 0,
                  createdAt: DateTime.utc(2026),
                  lastLoginAt: DateTime.utc(2026),
                ),
              ),
              jwtProvider.overrideWith((_) async => 'synthetic-token'),
            ],
            child: MaterialApp(
              home: detail
                  ? const PostDetailScreen(postId: 'post-1')
                  : Scaffold(
                      body: SingleChildScrollView(
                        child: FeedCard(
                          item: FeedItem(
                            id: 'post-1',
                            feedId: 'discover',
                            author: 'Kai Rivers',
                            authorId: 'other-member',
                            contentType: ContentType.text,
                            title: 'Update',
                            body: 'A member update',
                            publishedAt: DateTime.utc(2026),
                          ),
                        ),
                      ),
                    ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (detail) {
          await tester.ensureVisible(find.text('Trust details'));
          await tester.tap(find.text('Trust details'));
          await tester.pumpAndSettle();
          final history = find.widgetWithText(
            TextButton,
            'View content history',
          );
          await tester.ensureVisible(history);
          await tester.tap(history);
        } else {
          await tester.tap(find.byTooltip('Post actions'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Post details'));
        }
        await tester.pumpAndSettle();
        expect(find.byType(ReceiptDrawerSheet), findsOneWidget);
        expect(find.text('Review recorded'), findsOneWidget);
        expect(
          adapter.requests.where((path) => path == '/api/posts/post-1/receipt'),
          hasLength(1),
        );
        final canOpenAppeal = gate.enabled && !gate.hasAppeal;
        expect(
          find.text('View appeal information'),
          canOpenAppeal ? findsOneWidget : findsNothing,
        );
        if (canOpenAppeal) {
          await tester.tap(find.text('View appeal information'));
          await tester.pumpAndSettle();
          expect(find.text('Appeal information'), findsOneWidget);
          expect(
            find.textContaining('only from an eligible resolved'),
            findsOneWidget,
          );
          expect(find.text('Submit'), findsNothing);
        }
        expect(find.text('Created: complete'), findsNothing);
        expect(find.text('Media checked: none'), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
    testWidgets('$surface unavailable history keeps a recoverable drawer', (
      tester,
    ) async {
      final adapter = _HistoryAdapter(
        appealEnabled: false,
        hasAppeal: false,
        unavailable: true,
      );
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1'))
        ..httpClientAdapter = adapter;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            secureDioProvider.overrideWithValue(dio),
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            currentUserProvider.overrideWithValue(null),
            jwtProvider.overrideWith((_) async => null),
          ],
          child: MaterialApp(
            home: detail
                ? const PostDetailScreen(postId: 'post-1')
                : Scaffold(
                    body: FeedCard(
                      item: FeedItem(
                        id: 'post-1',
                        feedId: 'discover',
                        author: 'Kai Rivers',
                        contentType: ContentType.text,
                        title: 'Update',
                        body: 'A member update',
                        publishedAt: DateTime.utc(2026),
                      ),
                    ),
                  ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      if (detail) {
        await tester.ensureVisible(find.text('Trust details'));
        await tester.tap(find.text('Trust details'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('View content history'));
        await tester.tap(find.text('View content history'));
      } else {
        await tester.tap(find.byTooltip('Post actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Post details'));
      }
      await tester.pumpAndSettle();
      expect(find.byType(ReceiptDrawerSheet), findsOneWidget);
      expect(find.text('Receipt unavailable'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('View appeal information'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}

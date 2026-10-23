import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';

import '../../../helpers/content_recovery.dart';

const _post = '0192c000-0000-7000-8000-000000000001';
const _root = '0192c000-0000-7000-8000-000000000002';
const _child = '0192c000-0000-7000-8000-000000000003';

class _NativeCommentAdapter implements HttpClientAdapter {
  _NativeCommentAdapter(this.link);
  final String link;
  final requests = <RequestOptions>[];

  Map<String, Object?> comment(String id, {String? parent}) => {
    'id': id,
    'authorId': 'synthetic-author',
    'parentId': parent,
    'conversationId': _root,
    'body': id == _root ? 'Synthetic root' : 'Exact reply target',
    'moderationState': 'allowed',
    'declaredCreationMode': 'human',
    'createdAt': '2026-10-01T00:00:00Z',
    'replyCount': id == _root ? 1 : 0,
  };

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    final Object body;
    if (options.path.endsWith('/notifications')) {
      body = {
        'items': [
          {
            'id': 'synthetic-notification',
            'notificationType': 'content.reply_received',
            'entityId': _child,
            'deeplink': link,
            'title': 'Synthetic comment notification',
            'readAt': '2026-10-01T00:00:00Z',
            'createdAt': '2026-10-01T00:00:00Z',
          },
        ],
        'totalUnread': 0,
        'nextCursor': null,
      };
    } else if (options.path.endsWith('/comments')) {
      body = {
        'items': [
          options.queryParameters['targetId'] == _child
              ? comment(_child, parent: _root)
              : comment(_root),
        ],
        'capabilities': {'conversations': true, 'nestedReplies': true},
      };
    } else if (options.path == '/api/posts/$_post') {
      body = {
        'post': {
          'id': _post,
          'authorId': 'synthetic-author',
          'body': 'Synthetic canonical post',
          'publicLabel': 'Human-authored',
          'declaredCreationMode': 'human',
          'moderationState': 'allowed',
          'createdAt': '2026-10-01T00:00:00Z',
        },
      };
    } else {
      throw StateError('Unexpected local fixture route: ${options.path}');
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  for (final valid in [true, false]) {
    testWidgets(
      'actual native notification parser and screen handle ${valid ? 'exact comment navigation' : 'malformed UTF-8'}',
      (tester) async {
        final adapter = _NativeCommentAdapter(
          valid
              ? '/post/$_post?commentId=$_child'
              : '/post/%FF?commentId=$_child',
        );
        final dio = Dio()..httpClientAdapter = adapter;
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              secureDioProvider.overrideWithValue(dio),
              notificationApiServiceProvider.overrideWithValue(
                NotificationApiService(
                  dioClient: dio,
                  ownerId: 'synthetic-viewer',
                ),
              ),
              currentUserProvider.overrideWithValue(
                User(
                  id: 'synthetic-viewer',
                  email: 'synthetic@example.invalid',
                  role: UserRole.user,
                  tier: UserTier.bronze,
                  reputationScore: 0,
                  createdAt: DateTime.utc(2026),
                  lastLoginAt: DateTime.utc(2026),
                ),
              ),
              jwtProvider.overrideWith((ref) async => 'synthetic-session'),
              contentRecoveryStorageProvider.overrideWithValue(
                MemoryContentRecoveryStorage(),
              ),
            ],
            child: const MaterialApp(home: NotificationsScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Synthetic comment notification'));
        await tester.pumpAndSettle();
        if (valid) {
          final detail = tester.widget<PostDetailScreen>(
            find.byType(PostDetailScreen),
          );
          expect(detail.postId, _post);
          expect(detail.initialCommentId, _child);
          await tester.ensureVisible(
            find.widgetWithText(OutlinedButton, 'Comments'),
          );
          await tester.tap(find.widgetWithText(OutlinedButton, 'Comments'));
          await tester.pumpAndSettle();
          final thread = tester.widget<CommentThreadScreen>(
            find.byType(CommentThreadScreen),
          );
          expect(thread.postId, _post);
          expect(thread.initialCommentId, _child);
          expect(find.text('Exact reply target').hitTestable(), findsOneWidget);
        } else {
          expect(find.byType(PostDetailScreen), findsNothing);
          expect(
            find.text('This notification has no available destination.'),
            findsOneWidget,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}

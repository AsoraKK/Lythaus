import 'dart:async';
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
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';

const _discover = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.hot,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
  isHome: true,
);

class _StaticFeed extends LiveFeedController {
  _StaticFeed()
    : super(
        LiveFeedState(
          isInitialLoading: false,
          items: [
            FeedItem(
              id: 'p1',
              feedId: 'discover',
              author: 'Synthetic owner',
              authorId: 'owner',
              contentType: ContentType.text,
              title: 'Synthetic feed post',
              body: 'Synthetic post',
              authorshipLabel: 'Human-authored',
              publishedAt: DateTime.utc(2026),
            ),
          ],
        ),
      );
  @override
  Future<void> loadMore() async {}
  @override
  Future<void> refresh() async =>
      state = const LiveFeedState(items: [], isInitialLoading: false);
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.reply);
  final Future<ResponseBody> Function(RequestOptions) reply;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return reply(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _response(Object data, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        'content-type': ['application/json'],
      },
    );

Map<String, dynamic> _body(RequestOptions request) => request.data is String
    ? jsonDecode(request.data as String) as Map<String, dynamic>
    : Map<String, dynamic>.from(request.data as Map);

Map<String, dynamic> _post() => {
  'id': 'p1',
  'authorId': 'owner',
  'body': 'Synthetic post',
  'publicLabel': 'Human-authored',
  'declaredCreationMode': 'human',
  'moderationState': 'allowed',
  'createdAt': '2026-10-01T00:00:00Z',
};

Map<String, dynamic> _comment(
  String id, {
  String author = 'owner',
  String? parent,
}) => {
  'id': id,
  'authorId': author,
  'body': 'Comment $id',
  'parentId': parent,
  'declaredCreationMode': 'human',
  'moderationState': 'allowed',
  'createdAt': '2026-10-01T00:00:00Z',
};

User _user([String id = 'owner']) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Future<void> _pump(
  WidgetTester tester,
  _Adapter adapter, {
  String? actor = 'owner',
  bool feed = false,
}) async {
  tester.view.physicalSize = const Size(390, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1'));
  dio.httpClientAdapter = adapter;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        secureDioProvider.overrideWithValue(dio),
        postRepositoryProvider.overrideWithValue(PostRepositoryImpl(dio)),
        currentUserProvider.overrideWithValue(
          actor == null ? null : _user(actor),
        ),
        jwtProvider.overrideWith(
          (ref) async => actor == null ? null : 'synthetic-token',
        ),
        feedListProvider.overrideWithValue(const [_discover]),
        liveFeedStateProvider.overrideWith((ref, feed) => _StaticFeed()),
      ],
      child: MaterialApp(
        home: feed
            ? const HomeFeedNavigator()
            : Builder(
                builder: (context) => Scaffold(
                  body: Column(
                    children: [
                      TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                const CommentThreadScreen(postId: 'p1'),
                          ),
                        ),
                        child: const Text('Open comments'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                const PostDetailScreen(postId: 'p1'),
                          ),
                        ),
                        child: const Text('Open post'),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openComments(WidgetTester tester) async {
  await tester.tap(find.text('Open comments'));
  await tester.pumpAndSettle();
}

Future<void> _draft(
  WidgetTester tester,
  String text, {
  String disclosure = 'Human-authored',
}) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.tap(find.widgetWithText(ChoiceChip, disclosure));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  testWidgets(
    'discover card edit uses fresh disclosure and refreshes pending content out of feed',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'PUT'
            ? _response({
                'post': {
                  'id': 'p1',
                  ..._body(request),
                  'moderationState': 'under_review',
                },
              })
            : _response({'items': <Object>[]}),
      );
      await _pump(tester, adapter, feed: true);
      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit post'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Updated from Discover', disclosure: 'AI-assisted');
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(_body(adapter.requests.singleWhere((r) => r.method == 'PUT')), {
        'body': 'Updated from Discover',
        'declaredCreationMode': 'ai_assisted',
      });
      expect(
        find.text('Edit submitted. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(find.text('Synthetic feed post'), findsNothing);
    },
  );

  test(
    'canonical body, declaration, parent and tombstone parse without legacy fields',
    () {
      final comment = domain.Comment.fromJson({
        ..._comment('c1', parent: 'root'),
        'text': 'stale',
        'postId': 'p1',
      });
      expect(comment.text, 'Comment c1');
      expect(comment.parentCommentId, 'root');
      expect(comment.declaredCreationMode, 'human');
      expect(
        domain.Comment.fromJson({
          ..._comment('c1'),
          'deleted': true,
          'body': null,
        }).text,
        '[deleted]',
      );
      final post = domain.Post.fromJson({..._post(), 'text': 'stale'});
      expect(post.text, 'Synthetic post');
      expect(post.moderationState, 'allowed');
      expect(post.declaredCreationMode, 'human');
    },
  );

  testWidgets(
    'bare canonical create response clears draft and shows pending publication',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'POST'
            ? _response({
                'id': 'new',
                'postId': 'p1',
                ..._body(request),
                'moderationState': 'under_review',
              }, 201)
            : _response({'items': <Object>[], 'nextCursor': null}),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await _draft(tester, 'A synthetic comment');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      final write = adapter.requests.singleWhere((r) => r.method == 'POST');
      expect(_body(write), {
        'body': 'A synthetic comment',
        'declaredCreationMode': 'human',
      });
      expect(write.headers['Idempotency-Key'], isNotEmpty);
      expect(find.text('A synthetic comment'), findsOneWidget);
      expect(
        find.text('Under review. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
    },
  );

  testWidgets(
    'replies use parentId and do not alter body or allow deeper replies',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'POST'
            ? _response({
                'id': 'reply',
                ..._body(request),
                'moderationState': 'under_review',
              }, 201)
            : _response({
                'items': [
                  _comment('root', author: 'other'),
                  _comment('nested', author: 'other', parent: 'root'),
                ],
              }),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      expect(find.text('Reply'), findsOneWidget);
      await tester.tap(find.text('Reply'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Reply without an artificial mention');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(_body(adapter.requests.singleWhere((r) => r.method == 'POST')), {
        'body': 'Reply without an artificial mention',
        'declaredCreationMode': 'human',
        'parentId': 'root',
      });
      expect(find.text('Reply'), findsOneWidget);
    },
  );

  testWidgets(
    'declaration and AI-assisted grapheme limit block writes locally',
    (tester) async {
      final adapter = _Adapter(
        (request) async => _response({'items': <Object>[]}),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.enterText(
        find.byType(TextField),
        'A comment without a declaration',
      );
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(
        find.text('Choose an authorship disclosure before posting'),
        findsOneWidget,
      );
      await _draft(tester, '👨‍👩‍👧‍👦' * 250, disclosure: 'AI-assisted');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(find.textContaining('cannot exceed 249'), findsOneWidget);
      expect(adapter.requests.where((r) => r.method == 'POST'), isEmpty);
    },
  );

  for (final code in [
    'timeout',
    'idempotency_in_progress',
    'idempotency_outcome_unknown',
  ]) {
    testWidgets('$code retry reuses body and key without reloading the list', (
      tester,
    ) async {
      var writes = 0;
      final adapter = _Adapter((request) async {
        if (request.method != 'POST') return _response({'items': <Object>[]});
        if (++writes == 1) {
          if (code == 'timeout') {
            throw DioException(
              requestOptions: request,
              type: DioExceptionType.receiveTimeout,
            );
          }
          return _response({'error': code}, 409);
        }
        return _response({
          'id': 'new',
          ..._body(request),
          'moderationState': 'under_review',
        }, 201);
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await _draft(tester, 'Retain this draft');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.controller!.text, 'Retain this draft');
      expect(field.enabled, isFalse);
      await tester.tap(find.text('Retry', skipOffstage: true));
      await tester.pumpAndSettle();
      final requests = adapter.requests
          .where((r) => r.method == 'POST')
          .toList();
      expect(requests, hasLength(2));
      expect(
        requests[1].headers['Idempotency-Key'],
        requests[0].headers['Idempotency-Key'],
      );
      expect(_body(requests[1]), _body(requests[0]));
      expect(adapter.requests.where((r) => r.method == 'GET'), hasLength(1));
      expect(field.controller!.text, isEmpty);
    });
  }

  testWidgets(
    'duplicate send and back during a delayed write keep one submission',
    (tester) async {
      final reply = Completer<ResponseBody>();
      final adapter = _Adapter(
        (request) async => request.method == 'POST'
            ? reply.future
            : _response({'items': <Object>[]}),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await _draft(tester, 'One comment');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump();
      tester
          .widget<TextField>(find.byType(TextField))
          .onSubmitted
          ?.call('One comment');
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(find.text('Comments'), findsOneWidget);
      expect(adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
      reply.complete(
        _response({
          'id': 'new',
          'body': 'One comment',
          'declaredCreationMode': 'human',
          'moderationState': 'under_review',
        }, 201),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'an incomplete write response preserves the draft and exposes retry',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'POST'
            ? _response({'ok': true}, 201)
            : _response({'items': <Object>[]}),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await _draft(tester, 'Keep this on malformed acknowledgement');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Keep this on malformed acknowledgement',
      );
      expect(find.textContaining('comment outcome is unknown'), findsOneWidget);
    },
  );

  for (final actor in [null, 'other']) {
    testWidgets(
      'guest or another author cannot see mutation controls: $actor',
      (tester) async {
        final adapter = _Adapter(
          (request) async => request.path.endsWith('/comments')
              ? _response({
                  'items': [_comment('c1')],
                })
              : _response({'post': _post()}),
        );
        await _pump(tester, adapter, actor: actor);
        await _openComments(tester);
        expect(find.text('Edit comment'), findsNothing);
        expect(find.text('Delete comment'), findsNothing);
        await tester.pageBack();
        await tester.pumpAndSettle();
        await tester.tap(find.text('Open post'));
        await tester.pumpAndSettle();
        expect(find.byTooltip('Edit post'), findsNothing);
        expect(find.byTooltip('Delete post'), findsNothing);
      },
    );
  }

  testWidgets(
    'owner edits a comment with a fresh declaration and pending result',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'PUT'
            ? _response({
                'id': 'c1',
                ..._body(request),
                'moderationState': 'under_review',
              })
            : _response({
                'items': [_comment('c1')],
              }),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Edit comment'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Revised synthetic comment',
      );
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(adapter.requests.where((r) => r.method == 'PUT'), isEmpty);
      await tester.tap(find.widgetWithText(ChoiceChip, 'AI-assisted'));
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      final write = adapter.requests.singleWhere((r) => r.method == 'PUT');
      expect(write.path, '/api/comments/c1');
      expect(_body(write), {
        'body': 'Revised synthetic comment',
        'declaredCreationMode': 'ai_assisted',
      });
      expect(find.text('Revised synthetic comment'), findsOneWidget);
      expect(
        find.text('Under review. Publication checks are pending.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'owner deletion is confirmed, retains content on 403, then removes on acknowledgement',
    (tester) async {
      var deletes = 0;
      final adapter = _Adapter(
        (request) async => request.method == 'DELETE'
            ? ++deletes == 1
                  ? _response({'error': 'forbidden'}, 403)
                  : _response({'commentId': 'c1', 'deleted': true})
            : _response({
                'items': [_comment('c1')],
              }),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Delete comment'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(deletes, 0);
      await tester.tap(find.text('Delete comment'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete', skipOffstage: true));
      await tester.pumpAndSettle();
      expect(find.text('Comment c1'), findsOneWidget);
      expect(
        find.text('You are not allowed to change this content.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Retry', skipOffstage: true));
      await tester.pumpAndSettle();
      expect(find.text('Comment c1'), findsNothing);
      final writes = adapter.requests
          .where((r) => r.method == 'DELETE')
          .toList();
      expect(
        writes[1].headers['Idempotency-Key'],
        isNot(writes[0].headers['Idempotency-Key']),
      );
    },
  );

  testWidgets('wrong deletion acknowledgement retains content and replay key', (
    tester,
  ) async {
    final adapter = _Adapter(
      (request) async => request.method == 'DELETE'
          ? _response({'commentId': 'wrong', 'deleted': true})
          : _response({
              'items': [_comment('c1')],
            }),
    );
    await _pump(tester, adapter);
    await _openComments(tester);
    await tester.tap(find.text('Delete comment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete', skipOffstage: true));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry', skipOffstage: true));
    await tester.pumpAndSettle();
    expect(find.text('Comment c1'), findsOneWidget);
    final writes = adapter.requests.where((r) => r.method == 'DELETE').toList();
    expect(
      writes[1].headers['Idempotency-Key'],
      writes[0].headers['Idempotency-Key'],
    );
  });

  testWidgets(
    'canonical partial post revision preserves owner and enters pending state',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'PUT'
            ? _response({
                'post': {
                  'id': 'p1',
                  ..._body(request),
                  'moderationState': 'under_review',
                },
              })
            : _response({'post': _post()}),
      );
      await _pump(tester, adapter);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Edit post'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Revised synthetic post');
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(find.text('Revised synthetic post'), findsOneWidget);
      expect(find.byTooltip('Delete post'), findsOneWidget);
      expect(
        find.text('Under review. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(
        adapter.requests.where(
          (r) => r.path == '/api/posts/p1' && r.method == 'GET',
        ),
        hasLength(1),
      );
    },
  );

  testWidgets('pending edit survives leaving and reopening with the same key', (
    tester,
  ) async {
    var writes = 0;
    final adapter = _Adapter((request) async {
      if (request.method != 'PUT') return _response({'post': _post()});
      if (++writes == 1) {
        return _response({'error': 'idempotency_outcome_unknown'}, 409);
      }
      return _response({
        'post': {
          'id': 'p1',
          ..._body(request),
          'moderationState': 'under_review',
        },
      });
    });
    await _pump(tester, adapter);
    await tester.tap(find.text('Open post'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Edit post'));
    await tester.pumpAndSettle();
    await _draft(tester, 'Preserved edit');
    await tester.tap(find.text('Submit edit'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Edit post'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      'Preserved edit',
    );
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    await tester.tap(find.text('Retry same edit'));
    await tester.pumpAndSettle();
    final requests = adapter.requests.where((r) => r.method == 'PUT').toList();
    expect(
      requests[1].headers['Idempotency-Key'],
      requests[0].headers['Idempotency-Key'],
    );
    expect(_body(requests[1]), _body(requests[0]));
  });

  testWidgets(
    'post deletion requires confirmation and pops only after matching acknowledgement',
    (tester) async {
      final adapter = _Adapter(
        (request) async => request.method == 'DELETE'
            ? _response({'postId': 'p1', 'deleted': true})
            : _response({'post': _post()}),
      );
      await _pump(tester, adapter);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Delete post'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(adapter.requests.where((r) => r.method == 'DELETE'), isEmpty);
      await tester.tap(find.byTooltip('Delete post'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete', skipOffstage: true));
      await tester.pumpAndSettle();
      expect(find.text('Open post'), findsOneWidget);
      expect(find.text('Synthetic post'), findsNothing);
      expect(
        adapter.requests
            .singleWhere((r) => r.method == 'DELETE')
            .headers['Idempotency-Key'],
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'unconfirmed post deletion stays visible and retries the same key',
    (tester) async {
      var deletes = 0;
      final adapter = _Adapter(
        (request) async => request.method == 'DELETE'
            ? ++deletes == 1
                  ? _response({'error': 'idempotency_in_progress'}, 409)
                  : _response({'postId': 'p1', 'deleted': true})
            : _response({'post': _post()}),
      );
      await _pump(tester, adapter);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.byTooltip('Delete post'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Delete', skipOffstage: true));
        await tester.pumpAndSettle();
        if (i == 0) expect(find.text('Synthetic post'), findsOneWidget);
      }
      final writes = adapter.requests
          .where((r) => r.method == 'DELETE')
          .toList();
      expect(
        writes[1].headers['Idempotency-Key'],
        writes[0].headers['Idempotency-Key'],
      );
      expect(find.text('Open post'), findsOneWidget);
    },
  );

  testWidgets(
    'late comments response after disposal does not update disposed state',
    (tester) async {
      final page = Completer<ResponseBody>();
      final adapter = _Adapter((request) => page.future);
      await _pump(tester, adapter);
      await tester.tap(find.text('Open comments'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox.shrink());
      page.complete(
        _response({
          'items': [_comment('late')],
        }),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('stale pagination cannot overwrite a newer refresh', (
    tester,
  ) async {
    final more = Completer<ResponseBody>();
    var initial = 0;
    final adapter = _Adapter((request) async {
      if (request.queryParameters['cursor'] != null) return more.future;
      return ++initial == 1
          ? _response({
              'items': List.generate(
                30,
                (i) => _comment('c$i', author: 'other'),
              ),
              'nextCursor': 'next',
            })
          : _response({
              'items': [_comment('fresh', author: 'other')],
            });
    });
    await _pump(tester, adapter);
    await _openComments(tester);
    final controller = tester
        .widget<ListView>(find.byType(ListView).first)
        .controller!;
    controller.jumpTo(controller.position.maxScrollExtent);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();
    expect(
      adapter.requests.where((r) => r.queryParameters['cursor'] == 'next'),
      hasLength(1),
    );
    final refresh = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();
    more.complete(
      _response({
        'items': [_comment('stale', author: 'other')],
      }),
    );
    await tester.pumpAndSettle();
    await refresh;
    expect(find.text('Comment fresh'), findsOneWidget);
    expect(find.text('Comment stale'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'deleted comment bodies become tombstones without mutation or reply actions',
    (tester) async {
      final adapter = _Adapter(
        (request) async => _response({
          'items': [
            {..._comment('deleted'), 'deleted': true, 'body': null},
          ],
        }),
      );
      await _pump(tester, adapter);
      await _openComments(tester);
      expect(find.text('[deleted]'), findsOneWidget);
      expect(find.text('Edit comment'), findsNothing);
      expect(find.text('Delete comment'), findsNothing);
      expect(find.text('Reply'), findsNothing);
    },
  );
}

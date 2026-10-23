import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import '../../../golden_test_utils.dart';

final _commentCaptureKey = GlobalKey();

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
  static int refreshCalls = 0;

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
  Future<void> refresh() async {
    refreshCalls++;
    state = const LiveFeedState(items: [], isInitialLoading: false);
  }
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
  StateProvider<User?>? mutableActorProvider,
  bool feed = false,
  MemoryContentRecoveryStorage? storage,
  bool canSubmit = true,
  Size viewport = const Size(390, 900),
  double textScale = 1,
  String? initialCommentId,
}) async {
  tester.view.physicalSize = viewport;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1'));
  dio.httpClientAdapter = adapter;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          storage ?? MemoryContentRecoveryStorage(),
        ),
        secureDioProvider.overrideWithValue(dio),
        postRepositoryProvider.overrideWithValue(PostRepositoryImpl(dio)),
        currentUserProvider.overrideWith(
          (ref) => mutableActorProvider == null
              ? actor == null
                    ? null
                    : _user(actor)
              : ref.watch(mutableActorProvider),
        ),
        jwtProvider.overrideWith(
          (ref) async => actor == null ? null : 'synthetic-token',
        ),
        feedListProvider.overrideWithValue(const [_discover]),
        liveFeedStateProvider.overrideWith((ref, feed) => _StaticFeed()),
      ],
      child: RepaintBoundary(
        key: _commentCaptureKey,
        child: MaterialApp(
          theme: LythausTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
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
                              builder: (_) => CommentThreadScreen(
                                postId: 'p1',
                                initialCommentId: initialCommentId,
                                canSubmit: canSubmit,
                              ),
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
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _captureComments(WidgetTester tester, String name) async {
  final directory = Platform.environment['COMMENT_SCREENSHOTS_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    final boundary =
        _commentCaptureKey.currentContext!.findRenderObject()!
            as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File('$directory/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

Map<String, dynamic> _conversationPage(
  List<Map<String, dynamic>> items, {
  String? nextCursor,
  String? refreshCursor,
  List<Map<String, dynamic>>? revalidatedItems,
}) => {
  'items': items,
  'nextCursor': nextCursor,
  'refreshCursor': refreshCursor,
  if (revalidatedItems != null) 'revalidatedItems': revalidatedItems,
  'capabilities': {'conversations': true, 'nestedReplies': true},
};

Future<void> _openComments(WidgetTester tester) async {
  await tester.tap(find.text('Open comments'));
  await tester.pumpAndSettle();
}

Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() condition, {
  String reason = 'Timed out waiting for widget state',
}) async {
  for (var i = 0; i < 60 && !condition(); i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
  expect(condition(), isTrue, reason: reason);
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

Future<void> _sendSyntheticComment(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.pump();
  await tester.tap(find.widgetWithText(ChoiceChip, 'Human-authored'));
  await tester.pump();
  await _pumpUntil(
    tester,
    () => find.text('Draft saved on this device.').evaluate().isNotEmpty,
  );
  await tester.tap(find.byIcon(Icons.send));
}

void main() {
  setUpAll(() async {
    await loadFontsForGoldenTests();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });

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

  testWidgets(
    'discover feed refreshes after a covered edit is explicitly closed',
    (tester) async {
      _StaticFeed.refreshCalls = 0;
      final editAcknowledgement = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.method == 'PUT' && request.path == '/api/posts/p1') {
          return editAcknowledgement.future;
        }
        return _response({'items': <Object>[], 'nextCursor': null});
      });
      await _pump(tester, adapter, feed: true);
      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit post'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Revised from Discover', disclosure: 'AI-assisted');
      await tester.tap(find.text('Submit edit'));
      await _pumpUntil(
        tester,
        () => adapter.requests.any(
          (request) =>
              request.method == 'PUT' && request.path == '/api/posts/p1',
        ),
      );

      Navigator.of(tester.element(find.byType(ContentEditorScreen))).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covering route')),
        ),
      );
      await tester.pumpAndSettle();
      editAcknowledgement.complete(
        _response({
          'post': {
            ..._post(),
            'body': 'Revised from Discover',
            'declaredCreationMode': 'ai_assisted',
            'moderationState': 'under_review',
          },
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('Covering route'), findsOneWidget);

      Navigator.of(tester.element(find.text('Covering route'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();

      expect(find.text('Synthetic feed post'), findsNothing);
      expect(
        find.text('Edit submitted. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(_StaticFeed.refreshCalls, 1);
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
      await tester.enterText(
        find.byType(TextField),
        'Draft retained while selecting a reply target',
      );
      await tester.pumpAndSettle();
      final editor = tester.state<EditableTextState>(find.byType(EditableText));
      await tester.tap(find.text('Reply'));
      await tester.pumpAndSettle();
      expect(
        tester.state<EditableTextState>(find.byType(EditableText)),
        same(editor),
      );
      expect(
        editor.widget.controller.text,
        'Draft retained while selecting a reply target',
      );
      expect(editor.widget.focusNode.hasFocus, isTrue);
      await tester.tap(find.byTooltip('Cancel reply'));
      await tester.pumpAndSettle();
      expect(
        tester.state<EditableTextState>(find.byType(EditableText)),
        same(editor),
      );
      expect(
        editor.widget.controller.text,
        'Draft retained while selecting a reply target',
      );
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
    'pending post disables new comments while preserving owner controls',
    (tester) async {
      final adapter = _Adapter(
        (request) async => _response({
          'items': [_comment('c1')],
        }),
      );
      await _pump(tester, adapter, canSubmit: false);
      await _openComments(tester);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithIcon(FilledButton, Icons.send))
            .onPressed,
        isNull,
      );
      expect(
        find.textContaining('Comments can be submitted after publication.'),
        findsOneWidget,
      );
      expect(find.text('Edit comment'), findsOneWidget);
      expect(find.text('Delete comment'), findsOneWidget);
      expect(find.text('Reply'), findsNothing);
      expect(
        adapter.requests.where((request) => request.method != 'GET'),
        isEmpty,
      );
    },
  );

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
    'post detail receives a covered edit acknowledgement when editor closes',
    (tester) async {
      final editAcknowledgement = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.method == 'PUT' && request.path == '/api/posts/p1') {
          return editAcknowledgement.future;
        }
        if (request.method == 'GET' && request.path == '/api/posts/p1') {
          return _response({'post': _post()});
        }
        return _response({'items': <Object>[], 'nextCursor': null});
      });
      await _pump(tester, adapter);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Edit post'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Revised synthetic post', disclosure: 'AI-assisted');
      await tester.tap(find.text('Submit edit'));
      await _pumpUntil(
        tester,
        () => adapter.requests.any(
          (request) =>
              request.method == 'PUT' && request.path == '/api/posts/p1',
        ),
      );

      Navigator.of(tester.element(find.byType(ContentEditorScreen))).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covering route')),
        ),
      );
      await tester.pumpAndSettle();
      editAcknowledgement.complete(
        _response({
          'post': {
            ..._post(),
            'body': 'Revised synthetic post',
            'declaredCreationMode': 'ai_assisted',
            'moderationState': 'under_review',
          },
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('Covering route'), findsOneWidget);

      Navigator.of(tester.element(find.text('Covering route'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();

      expect(find.text('Revised synthetic post'), findsOneWidget);
      expect(find.text('Synthetic post'), findsNothing);
      expect(
        find.text('Under review. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(find.text('Authorship: Under review'), findsOneWidget);
    },
  );

  testWidgets(
    'comment thread receives a covered edit acknowledgement when editor closes',
    (tester) async {
      final editAcknowledgement = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.method == 'PUT' && request.path == '/api/comments/c1') {
          return editAcknowledgement.future;
        }
        if (request.method == 'GET' && request.path.endsWith('/comments')) {
          return _response({
            'items': [_comment('c1')],
          });
        }
        return _response({'items': <Object>[], 'nextCursor': null});
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Edit comment'));
      await tester.pumpAndSettle();
      await _draft(
        tester,
        'Revised synthetic comment',
        disclosure: 'AI-assisted',
      );
      await tester.tap(find.text('Submit edit'));
      await _pumpUntil(
        tester,
        () => adapter.requests.any(
          (request) =>
              request.method == 'PUT' && request.path == '/api/comments/c1',
        ),
      );

      Navigator.of(tester.element(find.byType(ContentEditorScreen))).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covering route')),
        ),
      );
      await tester.pumpAndSettle();
      editAcknowledgement.complete(
        _response({
          'id': 'c1',
          'body': 'Revised synthetic comment',
          'declaredCreationMode': 'ai_assisted',
          'moderationState': 'under_review',
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('Covering route'), findsOneWidget);

      Navigator.of(tester.element(find.text('Covering route'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();

      expect(find.text('Revised synthetic comment'), findsOneWidget);
      expect(find.text('Comment c1'), findsNothing);
      expect(
        find.text('Under review. Publication checks are pending.'),
        findsOneWidget,
      );
      expect(find.text('AI-assisted'), findsAtLeastNWidgets(1));
    },
  );

  testWidgets(
    'synthetic late edit response cannot restore a comment removed by refresh',
    (tester) async {
      final editResponse = Completer<ResponseBody>();
      var commentReads = 0;
      final adapter = _Adapter((request) async {
        if (request.method == 'PUT') return editResponse.future;
        if (request.method == 'GET' && request.path.endsWith('/comments')) {
          return ++commentReads == 1
              ? _response({
                  'items': [_comment('c1')],
                })
              : _response({'items': <Object>[]});
        }
        return _response({'items': <Object>[]});
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Edit comment'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Late synthetic edit receipt',
      );
      await tester.tap(find.widgetWithText(ChoiceChip, 'AI-assisted'));
      await tester.pump();
      await tester.tap(find.text('Submit edit'));
      for (var i = 0; i < 10; i++) {
        if (adapter.requests.any((request) => request.method == 'PUT')) break;
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(adapter.requests.where((r) => r.method == 'PUT'), hasLength(1));

      final refresh = tester
          .widget<RefreshIndicator>(
            find.byType(RefreshIndicator, skipOffstage: false).first,
          )
          .onRefresh;
      var refreshCompleted = false;
      final refreshing = refresh().whenComplete(() => refreshCompleted = true);
      for (var i = 0; i < 10 && !refreshCompleted; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      await refreshing;
      expect(find.byType(TextField), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Late synthetic edit receipt',
      );

      editResponse.complete(
        _response({
          'id': 'c1',
          'body': 'Late synthetic edit receipt',
          'declaredCreationMode': 'ai_assisted',
          'moderationState': 'under_review',
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('Submit edit'), findsNothing);
      expect(
        find.text('No comments yet. Be the first to reply.'),
        findsOneWidget,
      );
      expect(find.text('Late synthetic edit receipt'), findsNothing);
      expect(tester.takeException(), isNull);
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
            : _response({
                'post': {
                  ..._post(),
                  'trustStatus': 'verified_signals_attached',
                  'timeline': {
                    'created': 'complete',
                    'mediaChecked': 'complete',
                    'moderation': 'complete',
                  },
                  'proofSignalsProvided': true,
                  'verifiedContextBadgeEligible': true,
                  'featuredEligible': true,
                },
              }),
      );
      await _pump(tester, adapter);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      expect(find.text('Supporting evidence supplied'), findsOneWidget);
      await tester.tap(find.byTooltip('Edit post'));
      await tester.pumpAndSettle();
      await _draft(tester, 'Revised synthetic post');
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(find.text('Revised synthetic post'), findsOneWidget);
      expect(find.text('Supporting evidence supplied'), findsNothing);
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

  for (final secondMutationStatus in <int?>[null, 503, 403]) {
    testWidgets('synthetic stale initial read reloads after a second mutation '
        '${secondMutationStatus == null ? 'succeeds' : 'fails with $secondMutationStatus'}', (
      tester,
    ) async {
      final initialRead = Completer<ResponseBody>();
      final secondWrite = Completer<ResponseBody>();
      var commentReads = 0;
      var writes = 0;
      final adapter = _Adapter((request) async {
        if (request.method == 'GET' &&
            request.path.endsWith('/comments') &&
            request.queryParameters['cursor'] == null) {
          commentReads++;
          if (commentReads == 1) return initialRead.future;
          return _response({
            'items': [
              _comment('first'),
              if (secondMutationStatus == null) _comment('second'),
            ],
          });
        }
        if (request.method == 'POST') {
          writes++;
          if (writes == 1) {
            return _response({
              'id': 'first',
              ..._body(request),
              'moderationState': 'under_review',
            }, 201);
          }
          if (writes == 2) return secondWrite.future;
          return _response({
            'id': 'second-retried',
            'body': 'Second synthetic send',
            'declaredCreationMode': 'human',
            'moderationState': 'under_review',
          }, 201);
        }
        return _response({'items': <Object>[]});
      });

      await _pump(tester, adapter);
      await tester.tap(find.text('Open comments'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await _pumpUntil(
        tester,
        () =>
            find.byType(TextField).evaluate().isNotEmpty &&
            find.text('Restoring draft…').evaluate().isEmpty &&
            tester
                    .widget<FilledButton>(
                      find.widgetWithIcon(FilledButton, Icons.send),
                    )
                    .onPressed !=
                null,
      );

      await _sendSyntheticComment(tester, 'First synthetic send');
      await _pumpUntil(
        tester,
        () {
          final input = tester.widget<TextField>(find.byType(TextField));
          final send = tester.widget<FilledButton>(
            find.widgetWithIcon(FilledButton, Icons.send),
          );
          return writes == 1 &&
              input.controller!.text.isEmpty &&
              send.onPressed != null;
        },
        reason:
            'First write did not finish: writes=$writes, '
            'input=${tester.widget<TextField>(find.byType(TextField)).controller!.text}, '
            'sendDisabled=${tester.widget<FilledButton>(find.widgetWithIcon(FilledButton, Icons.send)).onPressed == null}, '
            'restoring=${find.text('Restoring draft…').evaluate().isNotEmpty}, '
            'signInNotice=${find.text('Sign in to comment.').evaluate().isNotEmpty}, '
            'errorBanner=${find.byType(MaterialBanner).evaluate().isNotEmpty}, '
            'requests=${adapter.requests.map((request) => request.method).toList()}',
      );

      await _sendSyntheticComment(tester, 'Second synthetic send');
      await _pumpUntil(tester, () => writes == 2);
      expect(commentReads, 1);

      initialRead.complete(
        _response({
          'items': [_comment('first')],
        }),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      expect(
        commentReads,
        1,
        reason: 'The fresh read must wait for the active second mutation.',
      );

      if (secondMutationStatus != null) {
        secondWrite.complete(
          _response({
            'error': {
              'code': 'ACCESS_DENIED',
              'message': 'Synthetic rejection',
            },
          }, secondMutationStatus),
        );
      } else {
        secondWrite.complete(
          _response({
            'id': 'second',
            'body': 'Second synthetic send',
            'declaredCreationMode': 'human',
            'moderationState': 'under_review',
          }, 201),
        );
      }

      await _pumpUntil(tester, () => commentReads == 2);
      await tester.pumpAndSettle();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Comment first'), findsOneWidget);
      expect(
        find.text('Comment second'),
        secondMutationStatus == null ? findsOneWidget : findsNothing,
      );
      expect(commentReads, 2, reason: 'The deferred refresh must run once.');
      if (secondMutationStatus == 403) {
        expect(
          find.text('You are not allowed to change this content.'),
          findsOneWidget,
        );
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller!.text,
          'Second synthetic send',
        );
        await tester.tap(find.text('Retry'));
        await _pumpUntil(tester, () => writes == 3);
        await tester.pumpAndSettle();
        expect(
          find.text('You are not allowed to change this content.'),
          findsNothing,
        );
        expect(find.text('Second synthetic send'), findsOneWidget);
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller!.text,
          isEmpty,
        );
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('synthetic deferred refresh stays scoped to the active account', (
    tester,
  ) async {
    final actorProvider = StateProvider<User?>((ref) => _user());
    final initialRead = Completer<ResponseBody>();
    final secondWrite = Completer<ResponseBody>();
    var commentReads = 0;
    var writes = 0;
    final adapter = _Adapter((request) async {
      if (request.method == 'GET' &&
          request.path.endsWith('/comments') &&
          request.queryParameters['cursor'] == null) {
        commentReads++;
        if (commentReads == 1) return initialRead.future;
        return _response({'items': <Object>[]});
      }
      if (request.method == 'POST') {
        writes++;
        if (writes == 1) {
          return _response({
            'id': 'first',
            ..._body(request),
            'moderationState': 'under_review',
          }, 201);
        }
        return secondWrite.future;
      }
      return _response({'items': <Object>[]});
    });

    await _pump(tester, adapter, mutableActorProvider: actorProvider);
    await tester.tap(find.text('Open comments'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await _pumpUntil(
      tester,
      () =>
          find.byType(TextField).evaluate().isNotEmpty &&
          find.text('Restoring draft…').evaluate().isEmpty,
    );

    await _sendSyntheticComment(tester, 'First synthetic send');
    await _pumpUntil(tester, () => writes == 1);
    await _pumpUntil(
      tester,
      () => tester
          .widget<TextField>(find.byType(TextField))
          .controller!
          .text
          .isEmpty,
    );
    await _sendSyntheticComment(tester, 'Second synthetic send');
    await _pumpUntil(tester, () => writes == 2);

    initialRead.complete(
      _response({
        'items': [_comment('first')],
      }),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    final container = ProviderScope.containerOf(
      tester.element(find.byType(CommentThreadScreen)),
    );
    container.read(actorProvider.notifier).state = _user('new-actor');
    await tester.pump();
    await _pumpUntil(tester, () => commentReads == 2);
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);

    secondWrite.complete(
      _response({
        'id': 'second',
        'body': 'Second synthetic send',
        'declaredCreationMode': 'human',
        'moderationState': 'under_review',
      }, 201),
    );
    await tester.pumpAndSettle();
    expect(find.text('Comment first'), findsNothing);
    expect(find.text('Comment second'), findsNothing);
    expect(
      commentReads,
      2,
      reason: 'Account change must discard the old queue.',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'synthetic queued refresh preserves delete rejection and its retry',
    (tester) async {
      final firstDelete = Completer<ResponseBody>();
      var commentReads = 0;
      var deletes = 0;
      final adapter = _Adapter((request) async {
        if (request.method == 'GET' &&
            request.path.endsWith('/comments') &&
            request.queryParameters['cursor'] == null) {
          commentReads++;
          return _response({
            'items': [_comment('c1')],
          });
        }
        if (request.method == 'DELETE') {
          deletes++;
          return deletes == 1
              ? firstDelete.future
              : _response({'commentId': 'c1', 'deleted': true});
        }
        return _response({'items': <Object>[]});
      });

      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Delete comment'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete', skipOffstage: true));
      await _pumpUntil(tester, () => deletes == 1);

      final refresh = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh;
      await refresh();
      await tester.pump();
      expect(commentReads, 1, reason: 'Refresh queues behind the delete.');

      firstDelete.complete(
        _response({
          'error': {'code': 'ACCESS_DENIED'},
        }, 403),
      );
      await _pumpUntil(tester, () => commentReads == 2);
      await tester.pumpAndSettle();
      expect(find.text('Comment c1'), findsOneWidget);
      expect(
        find.text('You are not allowed to change this content.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Retry'));
      await _pumpUntil(tester, () => deletes == 2);
      await tester.pumpAndSettle();
      expect(find.text('Comment c1'), findsNothing);
      expect(
        find.text('You are not allowed to change this content.'),
        findsNothing,
      );
      expect(commentReads, 2);
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
    'synthetic stale pagination cannot overwrite a newer comment edit',
    (tester) async {
      final stalePage = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.method == 'PUT') {
          return _response({
            'id': 'c0',
            ..._body(request),
            'moderationState': 'under_review',
          });
        }
        if (request.queryParameters['cursor'] == 'next') {
          return stalePage.future;
        }
        return _response({
          'items': List.generate(30, (i) => _comment('c$i')),
          'nextCursor': 'next',
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
      controller.jumpTo(0);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Edit comment').first);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Revised while an older page was pending',
      );
      await tester.tap(find.widgetWithText(ChoiceChip, 'AI-assisted'));
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(
        find.text('Revised while an older page was pending'),
        findsOneWidget,
      );

      stalePage.complete(
        _response({
          'items': [_comment('c0'), _comment('c30')],
          'nextCursor': 'next2',
        }),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Revised while an older page was pending'),
        findsOneWidget,
      );
      expect(find.text('Comment c0'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('synthetic stale pagination cannot restore a deleted comment', (
    tester,
  ) async {
    final stalePage = Completer<ResponseBody>();
    final adapter = _Adapter((request) async {
      if (request.method == 'DELETE') {
        return _response({'commentId': 'c0', 'deleted': true});
      }
      if (request.queryParameters['cursor'] == 'next') {
        return stalePage.future;
      }
      return _response({
        'items': List.generate(30, (i) => _comment('c$i')),
        'nextCursor': 'next',
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
    controller.jumpTo(0);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete comment').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete', skipOffstage: true).last);
    await tester.pumpAndSettle();
    expect(find.text('Comment c0'), findsNothing);

    stalePage.complete(
      _response({
        'items': [_comment('c0'), _comment('c30')],
        'nextCursor': 'next2',
      }),
    );
    await tester.pumpAndSettle();
    expect(find.text('Comment c0'), findsNothing);
    expect(find.text('Comment c30'), findsNothing);
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

  testWidgets(
    'pending owner post survives reopening and can be edited and deleted',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      var saved = {
        ..._post(),
        'body': 'Private pending post',
        'moderationState': 'under_review',
      };
      final adapter = _Adapter((request) async {
        if (request.method == 'GET') {
          return request.path.endsWith('/owner-view')
              ? _response({'post': saved})
              : _response({'error': 'post_not_found'}, 404);
        }
        if (request.method == 'PUT') {
          saved = {...saved, ..._body(request)};
          return _response({'post': saved});
        }
        return _response({'postId': 'p1', 'deleted': true});
      });
      await _pump(tester, adapter, storage: storage);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      expect(find.text('Private pending post'), findsOneWidget);
      expect(find.byTooltip('Edit post'), findsOneWidget);
      await tester.tap(find.byTooltip('Edit post'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Revised pending post');
      await tester.tap(find.text('Human-authored'));
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(find.text('Revised pending post'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await _pump(tester, adapter, storage: storage);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      expect(find.text('Revised pending post'), findsOneWidget);
      await tester.tap(find.byTooltip('Delete post'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      expect(adapter.requests.where((r) => r.method == 'DELETE'), hasLength(1));
    },
  );

  testWidgets(
    'own pending comment is restored privately after process restart',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      final journal = ContentMutationRegistry(storage: storage)
        ..activate('owner');
      await journal.ready;
      final attempt = await journal.beginDurable('comment-create:owner:p1', {
        'body': 'Private saved comment',
        'declaredCreationMode': 'human',
      });
      await journal.finishDurable(
        attempt,
        receipt: const OwnedContent('comment', 'pending', postId: 'p1'),
      );
      journal.dispose();
      var saved = {
        ..._comment('pending'),
        'postId': 'p1',
        'body': 'Private saved comment',
        'moderationState': 'under_review',
      };
      final adapter = _Adapter((request) async {
        if (request.path.endsWith('/owner-view')) {
          return _response({'comment': saved});
        }
        if (request.method == 'GET') return _response({'items': <Object>[]});
        if (request.method == 'PUT') {
          saved = {...saved, ..._body(request)};
          return _response(saved);
        }
        return _response({'commentId': 'pending', 'deleted': true});
      });
      await _pump(tester, adapter, storage: storage);
      await _openComments(tester);
      expect(find.text('Private saved comment'), findsOneWidget);
      expect(find.text('Reply'), findsNothing);
      await tester.tap(find.text('Edit comment'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Private revised comment');
      await tester.tap(find.text('AI-assisted'));
      await tester.tap(find.text('Submit edit'));
      await tester.pumpAndSettle();
      expect(find.text('Private revised comment'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await _pump(tester, adapter, storage: storage);
      await _openComments(tester);
      expect(find.text('Private revised comment'), findsOneWidget);
      await tester.tap(find.text('Delete comment'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      expect(find.text('Private revised comment'), findsNothing);
    },
  );

  testWidgets(
    'conversation replies expand, keep context and check new replies explicitly',
    (tester) async {
      final adapter = _Adapter((request) async {
        if (request.queryParameters['conversationId'] == 'root') {
          expect(request.queryParameters['sort'], 'newest');
          if (request.queryParameters['refresh'] == 'true') {
            expect(request.queryParameters['cursor'], 'reply-tail');
            return _response(
              _conversationPage(
                [
                  {
                    ..._comment('late', author: 'other', parent: 'nested'),
                    'conversationId': 'root',
                    'createdAt': '2026-10-02T00:00:00Z',
                  },
                ],
                refreshCursor: 'new-tail',
                revalidatedItems: [
                  {
                    ..._comment('reply', author: 'other', parent: 'root'),
                    'conversationId': 'root',
                  },
                  {
                    ..._comment('nested', author: 'other', parent: 'reply'),
                    'conversationId': 'root',
                    'createdAt': '2026-10-01T01:00:00Z',
                  },
                ],
              ),
            );
          }
          return _response(
            _conversationPage([
              {
                ..._comment('reply', author: 'other', parent: 'root'),
                'conversationId': 'root',
              },
              {
                ..._comment('nested', author: 'other', parent: 'reply'),
                'conversationId': 'root',
                'createdAt': '2026-10-01T01:00:00Z',
              },
            ], refreshCursor: 'reply-tail'),
          );
        }
        return _response(
          _conversationPage([
            {..._comment('root', author: 'other'), 'replyCount': 2},
          ]),
        );
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      expect(find.text('Comment reply'), findsNothing);
      expect(
        tester
            .widget<ChoiceChip>(
              find.widgetWithText(ChoiceChip, 'Most relevant'),
            )
            .onSelected,
        isNull,
      );
      await _captureComments(tester, 'comments-conversations-mobile');
      await tester.tap(find.byKey(const ValueKey('expand:root')));
      await tester.pumpAndSettle();
      expect(find.text('Comment reply'), findsOneWidget);
      expect(find.text('Comment nested'), findsOneWidget);
      expect(find.textContaining('Replying to'), findsNWidgets(2));
      expect(find.text('Reply'), findsNWidgets(3));
      final list = tester
          .widget<ListView>(find.byType(ListView).first)
          .controller!;
      await tester.ensureVisible(find.text('Check for new replies'));
      await tester.pumpAndSettle();
      final before = list.offset;
      await tester.tap(find.text('Check for new replies'));
      await tester.pumpAndSettle();
      expect(find.text('Comment late'), findsOneWidget);
      expect(list.offset, before);
      await _captureComments(tester, 'comments-nested-mobile');
      await tester.ensureVisible(find.text('Hide replies'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hide replies'));
      await tester.pumpAndSettle();
      expect(find.text('Comment nested'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'sort switching discards stale reply reads and never reuses another filter cursor',
    (tester) async {
      final lateReplies = Completer<ResponseBody>();
      final adapter = _Adapter((request) async {
        if (request.queryParameters['conversationId'] == 'root') {
          return lateReplies.future;
        }
        if (request.queryParameters['sort'] == 'oldest') {
          expect(request.queryParameters['cursor'], isNull);
          return _response(
            _conversationPage([_comment('oldest', author: 'other')]),
          );
        }
        return _response(
          _conversationPage([
            {..._comment('root', author: 'other'), 'replyCount': 1},
          ], nextCursor: 'newest-only'),
        );
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.byKey(const ValueKey('expand:root')));
      await tester.pump();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Oldest'));
      await tester.pump();
      lateReplies.complete(
        _response(
          _conversationPage([
            {
              ..._comment('stale', author: 'other', parent: 'root'),
              'conversationId': 'root',
            },
          ]),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Comment oldest'), findsOneWidget);
      expect(find.text('Comment stale'), findsNothing);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Oldest'))
            .selected,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  for (final revoked in ['blocked', 'under_review', 'deleted']) {
    testWidgets(
      'successful new-reply check revalidates a $revoked middle reply',
      (tester) async {
        var reads = 0;
        final middle = {
          ..._comment('middle', author: 'other', parent: 'root'),
          'conversationId': 'root',
        };
        final child = {
          ..._comment('child', author: 'other', parent: 'middle'),
          'conversationId': 'root',
        };
        final adapter = _Adapter((request) async {
          if (request.queryParameters['conversationId'] == 'root') {
            if (++reads == 1) {
              return _response(
                _conversationPage([middle, child], refreshCursor: 'tail'),
              );
            }
            expect(
              (request.queryParameters['revalidateIds'] as String).split(','),
              containsAll(['middle', 'child']),
            );
            return _response(
              _conversationPage(
                [],
                refreshCursor: 'tail',
                revalidatedItems: revoked == 'deleted'
                    ? [
                        {...middle, 'deleted': true, 'body': null},
                        child,
                      ]
                    : [],
              ),
            );
          }
          return _response(
            _conversationPage([
              {..._comment('root', author: 'other'), 'replyCount': 2},
            ]),
          );
        });
        await _pump(tester, adapter);
        await _openComments(tester);
        await tester.tap(find.byKey(const ValueKey('expand:root')));
        await tester.pumpAndSettle();
        expect(find.text('Comment middle'), findsOneWidget);
        await tester.ensureVisible(find.text('Check for new replies'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Check for new replies'));
        await tester.pumpAndSettle();
        expect(find.text('Comment middle'), findsNothing);
        expect(
          find.text('Comment child'),
          revoked == 'deleted' ? findsOneWidget : findsNothing,
        );
      },
    );
  }

  testWidgets(
    'fresh not-found owner receipt removes a previously submitted local comment',
    (tester) async {
      final adapter = _Adapter((request) async {
        if (request.method == 'POST') {
          return _response({
            'id': 'submitted',
            'postId': 'p1',
            ..._body(request),
            'moderationState': 'under_review',
          }, 201);
        }
        if (request.path.endsWith('/owner-view')) {
          return _response({'error': 'comment_not_found'}, 404);
        }
        return _response({'items': <Object>[]});
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await _draft(tester, 'Withdrawn pending reply');
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(find.text('Withdrawn pending reply'), findsOneWidget);
      final refreshing = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await tester.pumpAndSettle();
      await refreshing;
      expect(find.text('Withdrawn pending reply'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'changing sort never silently reparents an unfinished reply draft',
    (tester) async {
      final adapter = _Adapter((request) async {
        if (request.method == 'POST') {
          return _response({
            'id': 'pending',
            'postId': 'p1',
            ..._body(request),
            'moderationState': 'under_review',
          }, 201);
        }
        return _response(
          _conversationPage([
            _comment(
              request.queryParameters['sort'] == 'oldest'
                  ? 'older-root'
                  : 'root',
              author: 'other',
            ),
          ]),
        );
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.text('Reply'));
      await _draft(tester, 'This stays a reply to the same root.');
      await tester.tap(find.widgetWithText(ChoiceChip, 'Oldest'));
      await tester.pumpAndSettle();
      expect(find.text('Saved reply target retained.'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      expect(
        _body(
          adapter.requests.singleWhere((request) => request.method == 'POST'),
        )['parentId'],
        'root',
      );
    },
  );

  testWidgets(
    'comment sort is remembered on this device for the current account',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      final adapter = _Adapter(
        (request) async => _response(
          _conversationPage([
            _comment(
              request.queryParameters['sort'] as String,
              author: 'other',
            ),
          ]),
        ),
      );
      await _pump(tester, adapter, storage: storage);
      await _openComments(tester);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Oldest'));
      await tester.pumpAndSettle();
      expect(find.text('Comment oldest'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await _pump(tester, adapter, storage: storage);
      await _openComments(tester);
      expect(find.text('Comment oldest'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await _pump(tester, adapter, storage: storage, actor: 'another-account');
      await _openComments(tester);
      expect(find.text('Comment newest'), findsOneWidget);
    },
  );

  testWidgets(
    'reply context resolves and links to the exact unloaded parent comment',
    (tester) async {
      final adapter = _Adapter((request) async {
        if (request.queryParameters['targetId'] == 'parent') {
          return _response(
            _conversationPage([
              {
                ..._comment('parent', author: 'other', parent: 'root'),
                'conversationId': 'root',
              },
            ]),
          );
        }
        if (request.queryParameters['conversationId'] == 'root') {
          return _response(
            _conversationPage([
              {
                ..._comment('nested', author: 'other', parent: 'parent'),
                'conversationId': 'root',
              },
            ]),
          );
        }
        return _response(
          _conversationPage([
            {..._comment('root', author: 'other'), 'replyCount': 2},
          ]),
        );
      });
      await _pump(tester, adapter);
      await _openComments(tester);
      await tester.tap(find.byKey(const ValueKey('expand:root')));
      await tester.pumpAndSettle();
      expect(find.text('Comment parent'), findsNothing);
      await tester.tap(
        find.widgetWithText(TextButton, 'Replying to an earlier comment'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Comment parent'), findsOneWidget);
      expect(
        adapter.requests.where(
          (request) => request.queryParameters['targetId'] == 'parent',
        ),
        hasLength(1),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a notification target opens its exact conversation beyond the first root page',
    (tester) async {
      final adapter = _Adapter((request) async {
        if (request.queryParameters['targetId'] == 'target') {
          return _response(
            _conversationPage([
              {
                ..._comment('target', author: 'other', parent: 'old-root'),
                'conversationId': 'old-root',
              },
            ]),
          );
        }
        if (request.queryParameters['targetId'] == 'old-root') {
          return _response(
            _conversationPage([
              {..._comment('old-root', author: 'other'), 'replyCount': 1},
            ]),
          );
        }
        return _response(
          _conversationPage([_comment('new-root', author: 'other')]),
        );
      });
      await _pump(tester, adapter, initialCommentId: 'target');
      await _openComments(tester);
      expect(find.text('Comment target'), findsOneWidget);
      expect(find.text('Comment old-root'), findsOneWidget);
      expect(find.text('Hide replies'), findsOneWidget);
      expect(
        adapter.requests.where(
          (request) => request.queryParameters['targetId'] == 'target',
        ),
        hasLength(1),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a cached notification target is materialized outside the lazy viewport on repeated navigation',
    (tester) async {
      final roots = List.generate(
        25,
        (index) => _comment(
          'root${index.toString().padLeft(2, '0')}',
          author: 'other',
        ),
      );
      final adapter = _Adapter(
        (request) async => _response(
          _conversationPage(
            request.queryParameters['targetId'] != null
                ? roots
                      .where(
                        (row) =>
                            row['id'] == request.queryParameters['targetId'],
                      )
                      .toList()
                : roots,
          ),
        ),
      );
      await _pump(tester, adapter, initialCommentId: 'root00');
      for (var visit = 0; visit < 2; visit++) {
        await _openComments(tester);
        expect(find.text('Comment root00').hitTestable(), findsOneWidget);
        final list = tester
            .widget<ListView>(find.byType(ListView).first)
            .controller!;
        expect(list.offset, greaterThan(0));
        final row = tester.getRect(find.text('Comment root00'));
        final viewport = tester.getRect(find.byType(ListView).first);
        expect(row.top, greaterThanOrEqualTo(viewport.top));
        expect(row.bottom, lessThanOrEqualTo(viewport.bottom));
        await tester.pageBack();
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
    },
  );

  for (final status in [404, 500]) {
    testWidgets('exact-target denial $status handles cached content honestly', (
      tester,
    ) async {
      final adapter = _Adapter((request) async {
        if (request.queryParameters['targetId'] != null) {
          return _response({'error': 'post_not_found'}, status);
        }
        return _response(
          _conversationPage([_comment('cached', author: 'other')]),
        );
      });
      await _pump(tester, adapter, initialCommentId: 'unavailable');
      await _openComments(tester);
      expect(
        find.text('Comment cached'),
        status == 404 ? findsNothing : findsOneWidget,
      );
      expect(
        find.text('This post is unavailable.'),
        status == 404 ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }

  for (final status in [401, 403, 404]) {
    testWidgets(
      'withdrawn parent access $status clears cached children on refresh',
      (tester) async {
        var available = true;
        final adapter = _Adapter(
          (request) async => available
              ? _response({
                  'items': [_comment('sensitive', author: 'other')],
                })
              : _response({'error': 'post_not_found'}, status),
        );
        await _pump(tester, adapter);
        await _openComments(tester);
        expect(find.text('Comment sensitive'), findsOneWidget);
        available = false;
        final refreshing = tester
            .widget<RefreshIndicator>(find.byType(RefreshIndicator))
            .onRefresh();
        await tester.pumpAndSettle();
        await refreshing;
        expect(find.text('Comment sensitive'), findsNothing);
        expect(find.byType(MaterialBanner), findsOneWidget);
      },
    );
  }

  testWidgets(
    'nested conversations wrap at 320 pixels and large text without increasing indentation',
    (tester) async {
      await loadFontsForGoldenTests();
      final adapter = _Adapter(
        (request) async => _response(
          _conversationPage(
            request.queryParameters['conversationId'] == 'root'
                ? [
                    {
                      ..._comment('reply', author: 'other', parent: 'root'),
                      'conversationId': 'root',
                      'body': 'A clear reply with context on a narrow screen.',
                    },
                  ]
                : [
                    {
                      ..._comment('root', author: 'other'),
                      'replyCount': 1,
                      'body':
                          'A conversation can stay readable on a small phone.',
                    },
                  ],
          ),
        ),
      );
      await _pump(
        tester,
        adapter,
        viewport: const Size(320, 900),
        textScale: 1.6,
      );
      await _openComments(tester);
      final semantics = tester.ensureSemantics();
      await tester.tap(find.byKey(const ValueKey('expand:root')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Replying to'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _captureComments(tester, 'comments-narrow-large-text');
      semantics.dispose();
    },
  );

  testWidgets(
    'reopening after a lost deletion acknowledgement exposes only the saved replay',
    (tester) async {
      final storage = MemoryContentRecoveryStorage();
      var deleted = false;
      final adapter = _Adapter((request) async {
        if (request.method == 'GET') {
          return deleted
              ? _response({'error': 'post_not_found'}, 404)
              : _response({'post': _post()});
        }
        if (!deleted) {
          deleted = true;
          return _response({'error': 'synthetic_acknowledgement_lost'}, 503);
        }
        return _response({'postId': 'p1', 'deleted': true});
      });
      await _pump(tester, adapter, storage: storage);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Delete post'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      await _pump(tester, adapter, storage: storage);
      await tester.tap(find.text('Open post'));
      await tester.pumpAndSettle();
      expect(find.text('Retry saved deletion'), findsOneWidget);
      expect(find.text('Synthetic post'), findsNothing);
      await tester.tap(find.text('Retry saved deletion'));
      await tester.pumpAndSettle();
      final requests = adapter.requests
          .where((r) => r.method == 'DELETE')
          .toList();
      expect(requests, hasLength(2));
      expect(
        requests[1].headers['Idempotency-Key'],
        requests[0].headers['Idempotency-Key'],
      );
      expect(find.text('Open post'), findsOneWidget);
    },
  );
}

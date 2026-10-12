import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/owner_comments.dart';
import 'package:lythaus/features/profile/domain/owner_comment.dart';
import 'package:lythaus/features/profile/presentation/owner_comments_section.dart';
import 'package:lythaus/features/profile/presentation/profile_tab_view.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import '../../../golden_test_utils.dart';

final _user = User(
  id: 'synthetic-owner',
  email: 'synthetic@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
final _captureKey = GlobalKey();

OwnerComment _comment(String id, {bool pending = false, bool reply = false}) =>
    OwnerComment(
      id: id,
      authorId: _user.id,
      postId: 'synthetic-post',
      parentId: reply ? 'synthetic-parent' : null,
      depth: reply ? 1 : 0,
      body: pending
          ? 'Thank you for sharing your perspective.'
          : 'The local garden project is looking great.',
      declaredCreationMode: 'human',
      moderationState: pending ? 'under_review' : 'allowed',
      createdAt: DateTime.utc(2026, 10, 10),
      updatedAt: DateTime.utc(2026, 10, 10),
    );

class _Service extends OwnerCommentsService {
  _Service(this.fetch) : super(Dio());
  final Future<OwnerCommentsPage> Function(String?) fetch;
  int calls = 0;

  @override
  Future<OwnerCommentsPage> getPage({
    required String accessToken,
    String? cursor,
    CancelToken? cancelToken,
  }) {
    ++calls;
    return fetch(cursor);
  }
}

Future<void> _open(
  WidgetTester tester,
  _Service service, {
  String? currentUserId = 'synthetic-owner',
  double textScale = 1,
}) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        horizontalSwipeEnabledProvider.overrideWithValue(true),
        currentUserProvider.overrideWithValue(
          currentUserId == null ? null : _user.copyWith(id: currentUserId),
        ),
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(StateController<User?>(_user)),
        ),
        jwtProvider.overrideWith((ref) async => 'synthetic-token'),
        ownerCommentsServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: RepaintBoundary(
          key: _captureKey,
          child: Scaffold(
            appBar: AppBar(title: const Text('Your profile')),
            body: ProfileTabView(
              overview: const Center(child: Text('Profile overview')),
              posts: const Center(child: Text('Posts tab')),
              comments: ListView(
                key: const PageStorageKey('synthetic-owner-comments'),
                padding: const EdgeInsets.all(24),
                children: const [
                  OwnerCommentsSection(userId: 'synthetic-owner'),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.widgetWithText(Tab, 'Comments'));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(Tab, 'Comments'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 20));
}

Future<void> _capture(WidgetTester tester, String name) async {
  final directory = Platform.environment['PROFILE_SCREENSHOTS_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    final boundary =
        _captureKey.currentContext!.findRenderObject()!
            as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File('$directory/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(loadFontsForGoldenTests);
  testWidgets('loading is distinct from empty', (tester) async {
    final pending = Completer<OwnerCommentsPage>();
    final service = _Service((_) => pending.future);
    await _open(tester, service);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(find.text('No comments are available in this list.'), findsNothing);
    pending.complete(const OwnerCommentsPage(items: [], nextCursor: null));
    await tester.pumpAndSettle();
    expect(
      find.text('No comments are available in this list.'),
      findsOneWidget,
    );
    await _capture(tester, 'comments-empty');
  });

  for (final offline in [false, true]) {
    testWidgets('initial failure retries truthfully (offline=$offline)', (
      tester,
    ) async {
      var failures = 1;
      final service = _Service((_) async {
        if (failures-- > 0) {
          throw offline
              ? DioException(
                  requestOptions: RequestOptions(),
                  type: DioExceptionType.connectionError,
                )
              : StateError('synthetic service failure');
        }
        return const OwnerCommentsPage(items: [], nextCursor: null);
      });
      await _open(tester, service);
      expect(
        find.textContaining(
          offline ? 'You appear to be offline' : 'Unable to load your comments',
        ),
        findsOneWidget,
      );
      expect(
        find.text('No comments are available in this list.'),
        findsNothing,
      );
      if (offline) await _capture(tester, 'comments-offline');
      await tester.tap(find.text('Retry comments'));
      await tester.pumpAndSettle();
      expect(service.calls, 2);
      expect(
        find.text('No comments are available in this list.'),
        findsOneWidget,
      );
    });
  }

  testWidgets('pagination retries, deduplicates and survives tab round trips', (
    tester,
  ) async {
    var nextAttempts = 0;
    final first = _comment('comment-1');
    final second = _comment('comment-2', pending: true, reply: true);
    final service = _Service((cursor) async {
      if (cursor == null) {
        return OwnerCommentsPage(items: [first], nextCursor: 'page-2');
      }
      if (nextAttempts++ == 0) {
        throw DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.connectionError,
        );
      }
      return OwnerCommentsPage(items: [first, second], nextCursor: null);
    });
    await _open(tester, service);
    await tester.tap(find.text('Load more comments'));
    await tester.pumpAndSettle();
    expect(find.text(first.body), findsOneWidget);
    expect(find.textContaining('offline'), findsOneWidget);
    await tester.tap(find.text('Retry loading comments'));
    await tester.pumpAndSettle();
    expect(find.text(first.body), findsOneWidget);
    expect(find.text(second.body), findsOneWidget);
    expect(find.text('Awaiting review'), findsOneWidget);
    expect(find.text('Reply'), findsOneWidget);
    await _capture(tester, 'comments-owner');
    for (final tab in ['Overview', 'Posts', 'Comments']) {
      await tester.tap(find.widgetWithText(Tab, tab));
      await tester.pumpAndSettle();
    }
    expect(service.calls, 3);
    expect(find.text(second.body), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('large text keeps comments and pagination reachable', (
    tester,
  ) async {
    final service = _Service(
      (_) async => OwnerCommentsPage(
        items: [_comment('pending', pending: true, reply: true)],
        nextCursor: 'page-2',
      ),
    );
    await _open(tester, service, textScale: 2);
    await tester.pumpAndSettle();
    expect(find.text('Awaiting review'), findsOneWidget);
    expect(find.text('Load more comments'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _capture(tester, 'comments-large-text');
  });

  for (final viewer in [null, 'another-owner']) {
    testWidgets(
      'guest or another account never requests owner comments ($viewer)',
      (tester) async {
        final service = _Service(
          (_) async => const OwnerCommentsPage(items: [], nextCursor: null),
        );
        await _open(tester, service, currentUserId: viewer);
        expect(service.calls, 0);
        expect(find.text('Your comments'), findsNothing);
      },
    );
  }
}

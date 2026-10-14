import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';

import '../../../helpers/content_recovery.dart';

class _Repository extends Mock implements PostRepository {}

class _Dio extends Mock implements Dio {}

final _actor = StateProvider<User?>((_) => _user('owner'));

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

domain.Post _revisedPost() => domain.Post(
  id: 'synthetic-post',
  authorId: 'owner',
  authorUsername: 'Synthetic owner',
  text: 'Revised synthetic post',
  createdAt: DateTime.utc(2026),
  moderationState: 'under_review',
  declaredCreationMode: 'human',
);

void main() {
  setUpAll(() {
    registerFallbackValue(
      const UpdatePostRequest(text: 'fallback', aiLabel: 'human'),
    );
    registerFallbackValue(Options());
  });

  Future<
    ({
      GlobalKey<NavigatorState> navigatorKey,
      ProviderContainer container,
      MemoryContentRecoveryStorage storage,
      _Repository repository,
      _Dio dio,
    })
  >
  mountEditor(WidgetTester tester, {bool isComment = false}) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    final storage = MemoryContentRecoveryStorage();
    final repository = _Repository();
    final dio = _Dio();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          _actor.overrideWith((ref) => _user('owner')),
          currentUserProvider.overrideWith((ref) => ref.watch(_actor)),
          jwtProvider.overrideWith((ref) async => 'synthetic-token'),
          secureDioProvider.overrideWithValue(dio),
          postRepositoryProvider.overrideWithValue(repository),
          contentRecoveryStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp(
          navigatorKey: navigatorKey,
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    builder: (_) => ContentEditorScreen(
                      contentId: isComment
                          ? 'synthetic-comment'
                          : 'synthetic-post',
                      text: isComment
                          ? 'Original synthetic comment'
                          : 'Original synthetic post',
                      isComment: isComment,
                      postId: isComment ? 'synthetic-post' : null,
                    ),
                  ),
                ),
                child: const Text('Open editor'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ContentEditorScreen)),
    );
    await tester.enterText(
      find.byType(TextField).first,
      'Revised synthetic post',
    );
    await tester.tap(find.text('Human-authored'));
    await tester.pumpAndSettle();
    return (
      navigatorKey: navigatorKey,
      container: container,
      storage: storage,
      repository: repository,
      dio: dio,
    );
  }

  Future<void> startEdit(
    WidgetTester tester,
    _Repository repository,
    Completer<CreatePostResult> response,
  ) async {
    when(
      () => repository.updatePost(
        postId: 'synthetic-post',
        request: any(named: 'request'),
        token: 'synthetic-token',
      ),
    ).thenAnswer((_) => response.future);
    await tester.tap(find.text('Submit edit'));
    await tester.pumpAndSettle();
    verify(
      () => repository.updatePost(
        postId: 'synthetic-post',
        request: any(named: 'request'),
        token: 'synthetic-token',
      ),
    ).called(1);
  }

  Future<void> startCommentEdit(
    WidgetTester tester,
    _Dio dio,
    Completer<Response<Map<String, dynamic>>> response,
  ) async {
    when(
      () => dio.put<Map<String, dynamic>>(
        '/api/comments/synthetic-comment',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) => response.future);
    await tester.tap(find.text('Submit edit'));
    await tester.pumpAndSettle();
    verify(
      () => dio.put<Map<String, dynamic>>(
        '/api/comments/synthetic-comment',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).called(1);
  }

  testWidgets(
    'late post edit keeps a newer covering route on top and records receipt',
    (tester) async {
      final fixture = await mountEditor(tester);
      final response = Completer<CreatePostResult>();
      await startEdit(tester, fixture.repository, response);
      fixture.navigatorKey.currentState!.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Newer covering route')),
        ),
      );
      await tester.pumpAndSettle();

      response.complete(CreatePostSuccess(_revisedPost()));
      await tester.pumpAndSettle();

      expect(find.text('Newer covering route'), findsOneWidget);
      expect(
        find.byType(ContentEditorScreen, skipOffstage: false),
        findsOneWidget,
      );
      final registry = fixture.container.read(contentMutationRegistryProvider);
      expect(
        registry.owned,
        contains(
          isA<OwnedContent>().having(
            (receipt) => receipt.id,
            'id',
            'synthetic-post',
          ),
        ),
      );

      await fixture.navigatorKey.currentState!.maybePop();
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Edit saved. Under review; this is not an authorship assessment.',
        ),
        findsOneWidget,
      );
      expect(find.text('Submitting…'), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField).first).enabled,
        isFalse,
      );
      final savedButton = find.widgetWithText(FilledButton, 'Edit saved');
      expect(savedButton, findsOneWidget);
      expect(tester.widget<FilledButton>(savedButton).onPressed, isNull);
      await tester.tap(savedButton);
      await tester.pumpAndSettle();
      verifyNever(
        () => fixture.repository.updatePost(
          postId: 'synthetic-post',
          request: any(named: 'request'),
          token: 'synthetic-token',
        ),
      );
    },
  );

  testWidgets(
    'late comment edit keeps a newer covering route on top and records receipt',
    (tester) async {
      final fixture = await mountEditor(tester, isComment: true);
      final response = Completer<Response<Map<String, dynamic>>>();
      await startCommentEdit(tester, fixture.dio, response);
      fixture.navigatorKey.currentState!.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Newer covering route')),
        ),
      );
      await tester.pumpAndSettle();

      response.complete(
        Response<Map<String, dynamic>>(
          data: {
            'id': 'synthetic-comment',
            'body': 'Revised synthetic post',
            'declaredCreationMode': 'human',
            'moderationState': 'under_review',
          },
          requestOptions: RequestOptions(
            path: '/api/comments/synthetic-comment',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Newer covering route'), findsOneWidget);
      expect(
        find.byType(ContentEditorScreen, skipOffstage: false),
        findsOneWidget,
      );
      final registry = fixture.container.read(contentMutationRegistryProvider);
      expect(
        registry.owned,
        contains(
          isA<OwnedContent>()
              .having((receipt) => receipt.kind, 'kind', 'comment')
              .having((receipt) => receipt.id, 'id', 'synthetic-comment')
              .having((receipt) => receipt.postId, 'postId', 'synthetic-post'),
        ),
      );

      await fixture.navigatorKey.currentState!.maybePop();
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Edit saved. Under review; this is not an authorship assessment.',
        ),
        findsOneWidget,
      );
      expect(find.text('Submitting…'), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField).first).enabled,
        isFalse,
      );
      final savedButton = find.widgetWithText(FilledButton, 'Edit saved');
      expect(savedButton, findsOneWidget);
      expect(tester.widget<FilledButton>(savedButton).onPressed, isNull);
      await tester.tap(savedButton);
      await tester.pumpAndSettle();
      verifyNever(
        () => fixture.dio.put<Map<String, dynamic>>(
          '/api/comments/synthetic-comment',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      );
    },
  );

  testWidgets('current editor success closes and records durable receipt', (
    tester,
  ) async {
    final fixture = await mountEditor(tester);
    final response = Completer<CreatePostResult>();
    await startEdit(tester, fixture.repository, response);

    response.complete(CreatePostSuccess(_revisedPost()));
    await tester.pumpAndSettle();

    expect(find.byType(ContentEditorScreen), findsNothing);
    expect(find.text('Open editor'), findsOneWidget);
    final registry = fixture.container.read(contentMutationRegistryProvider);
    expect(registry.owned.single.id, 'synthetic-post');
    expect(fixture.storage.values.values.join(), contains('synthetic-post'));
  });

  testWidgets('late edit response after account switch does not close editor', (
    tester,
  ) async {
    final fixture = await mountEditor(tester);
    final response = Completer<CreatePostResult>();
    await startEdit(tester, fixture.repository, response);

    fixture.container.read(_actor.notifier).state = _user('other');
    await tester.pumpAndSettle();
    response.complete(CreatePostSuccess(_revisedPost()));
    await tester.pumpAndSettle();

    expect(find.byType(ContentEditorScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

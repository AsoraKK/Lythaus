import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';
import 'package:lythaus/features/feed/presentation/content_submission_gate.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/media/application/private_image_upload.dart';
import 'package:lythaus/features/media/presentation/private_image_upload_card.dart';
import 'package:lythaus/ui/components/create_post_modal.dart';

import '../../../helpers/content_recovery.dart';

class _Repository extends Mock implements PostRepository {}

class _Dio extends Mock implements Dio {}

class _Guard extends Mock implements DeviceIntegrityGuard {}

final _testGate = StateProvider<bool>((ref) => false);

final _owner = User(
  id: 'draft-owner',
  email: 'draft-owner@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Fixture {
  _Fixture({bool privateImagesEnabled = false}) {
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        requestOptions: RequestOptions(path: '/comments'),
        statusCode: 200,
        data: {
          'items': [
            {
              'id': 'existing-comment',
              'body': 'Existing private review comment',
              'authorId': 'draft-owner',
              'authorUsername': 'Synthetic owner',
              'declaredCreationMode': 'human',
              'moderationState': 'under_review',
              'createdAt': DateTime.utc(2026).toIso8601String(),
              'replyCount': 0,
            },
          ],
        },
      ),
    );
    container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(_owner),
        jwtProvider.overrideWith((ref) async => 'synthetic-token'),
        canCreatePostProvider.overrideWithValue(true),
        contentRecoveryStorageProvider.overrideWithValue(storage),
        postRepositoryProvider.overrideWithValue(repository),
        secureDioProvider.overrideWithValue(dio),
        privateImageUploadsEnabledProvider.overrideWithValue(
          privateImagesEnabled,
        ),
        deviceIntegrityGuardProvider.overrideWithValue(guard),
        contentSubmissionPresentationEnabledProvider.overrideWith(
          (ref) => ref.watch(_testGate),
        ),
      ],
    );
  }

  final storage = MemoryContentRecoveryStorage();
  final repository = _Repository();
  final dio = _Dio();
  final guard = _Guard();
  late final ProviderContainer container;

  ContentMutationRegistry get registry =>
      container.read(contentMutationRegistryProvider);

  Future<void> seed(String scope, {String? declaration = 'human'}) async {
    await registry.refresh();
    await registry.saveDraft(scope, {
      'body': 'Restored synthetic draft',
      if (declaration != null) 'declaredCreationMode': declaration,
    });
  }

  Future<void> mount(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(home: child),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> setGate(WidgetTester tester, bool value) async {
    container.read(_testGate.notifier).state = value;
    await tester.pumpAndSettle();
  }

  void expectNoWrites({int pendingCount = 0}) {
    verifyNever(() => guard.evaluate(any()));
    verifyNever(
      () => repository.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    );
    verifyNever(
      () => repository.updatePost(
        postId: any(named: 'postId'),
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    );
    verifyNever(
      () => dio.post<Map<String, dynamic>>(
        any(),
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    );
    verifyNever(
      () => dio.put<Map<String, dynamic>>(
        any(),
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    );
    expect(registry.attempts, hasLength(pendingCount));
  }
}

void _expectNoDeclarations() {
  expect(find.text('Human-authored'), findsNothing);
  expect(find.text('AI-assisted'), findsNothing);
  expect(find.textContaining('Author declaration'), findsNothing);
  expect(find.textContaining('How did you write this'), findsNothing);
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    registerFallbackValue(IntegrityUseCase.postContent);
    registerFallbackValue(const CreatePostRequest(text: 'fallback'));
    registerFallbackValue(const UpdatePostRequest(text: 'fallback'));
    registerFallbackValue(Options());
  });

  test('submission presentation is closed by default', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(
      container.read(contentSubmissionPresentationEnabledProvider),
      isFalse,
    );
  });

  for (final declaration in ['human', 'ai_assisted']) {
    testWidgets('restored $declaration post remains an editable draft', (
      tester,
    ) async {
      final fixture = _Fixture();
      addTearDown(fixture.container.dispose);
      await fixture.seed('post-create:draft-owner', declaration: declaration);
      await fixture.mount(tester, const CreatePostScreen());
      final post = find.widgetWithText(FilledButton, 'Post');
      expect(tester.widget<FilledButton>(post).onPressed, isNull);
      _expectNoDeclarations();

      await fixture.setGate(tester, true);
      final staleSubmit = tester.widget<FilledButton>(post).onPressed!;
      await fixture.setGate(tester, false);
      staleSubmit();
      await tester.pumpAndSettle();

      final ordinaryText = List.filled(300, 'x').join();
      await tester.enterText(find.byType(TextField).first, ordinaryText);
      await tester.pumpAndSettle();
      expect(
        fixture.registry.draft('post-create:draft-owner')?['body'],
        ordinaryText,
      );
      expect(find.textContaining('/5000'), findsWidgets);
      expect(find.textContaining('249'), findsNothing);
      _expectNoDeclarations();
      fixture.expectNoWrites();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('new draft does not acquire a hidden declaration', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.container.dispose);
    await fixture.mount(tester, const CreatePostScreen());
    await tester.enterText(
      find.byType(TextField).first,
      'Undeclared private draft',
    );
    await tester.pumpAndSettle();
    final draft = fixture.registry.draft('post-create:draft-owner');
    expect(draft?['body'], 'Undeclared private draft');
    expect(draft?['declaredCreationMode'], isNull);
    fixture.expectNoWrites();
  });

  testWidgets(
    'an uncertain saved submission remains locked and is not retried',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.container.dispose);
      await fixture.registry.refresh();
      final pending = await fixture.registry.beginDurable(
        'post-create:draft-owner',
        {'body': 'Unconfirmed text', 'declaredCreationMode': 'human'},
      );
      await fixture.mount(tester, const CreatePostScreen());
      final retry = find.widgetWithText(FilledButton, 'Retry submission');
      expect(tester.widget<FilledButton>(retry).onPressed, isNull);
      expect(
        tester.widget<TextField>(find.byType(TextField).first).enabled,
        isFalse,
      );
      _expectNoDeclarations();
      await fixture.setGate(tester, true);
      final staleRetry = tester.widget<FilledButton>(retry).onPressed!;
      await fixture.setGate(tester, false);
      staleRetry();
      await tester.pumpAndSettle();
      expect(
        fixture.registry.pending('post-create:draft-owner')?.key,
        pending.key,
      );
      expect(
        fixture.registry.pending('post-create:draft-owner')?.payload['body'],
        'Unconfirmed text',
      );
      fixture.expectNoWrites(pendingCount: 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('private-image runtime enablement does not expose uploads', (
    tester,
  ) async {
    final fixture = _Fixture(privateImagesEnabled: true);
    addTearDown(fixture.container.dispose);
    await fixture.mount(tester, const CreatePostScreen());
    expect(find.byType(PrivateImageUploadCard), findsNothing);
    expect(find.text('Choose image'), findsNothing);
    expect(find.text('Upload privately'), findsNothing);
    expect(find.text('Photos are not available yet'), findsOneWidget);
    verifyZeroInteractions(fixture.dio);
    fixture.expectNoWrites();
    expect(tester.takeException(), isNull);
  });

  testWidgets('modal blocks a stale submit callback and keeps its draft', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.container.dispose);
    await fixture.seed('post-create:draft-owner');
    await fixture.mount(tester, const Scaffold(body: CreatePostModal()));
    final post = find.byWidgetPredicate(
      (widget) => widget is LythButton && widget.label == 'Post',
    );
    expect(tester.widget<LythButton>(post).onPressed, isNull);
    _expectNoDeclarations();
    await fixture.setGate(tester, true);
    final staleSubmit = tester.widget<LythButton>(post).onPressed!;
    await fixture.setGate(tester, false);
    staleSubmit();
    await tester.pumpAndSettle();
    expect(
      fixture.registry.draft('post-create:draft-owner')?['body'],
      'Restored synthetic draft',
    );
    fixture.expectNoWrites();
    expect(tester.takeException(), isNull);
  });

  for (final isComment in [false, true]) {
    testWidgets(
      '${isComment ? 'comment' : 'post'} editor gates restored declarations',
      (tester) async {
        final fixture = _Fixture();
        addTearDown(fixture.container.dispose);
        final scope = '${isComment ? 'comment' : 'post'}:draft-owner:content-a';
        await fixture.seed(scope);
        await fixture.mount(
          tester,
          ContentEditorScreen(
            contentId: 'content-a',
            text: 'Original text',
            isComment: isComment,
            postId: isComment ? 'post-a' : null,
          ),
        );
        final submit = find.widgetWithText(FilledButton, 'Submit edit');
        expect(tester.widget<FilledButton>(submit).onPressed, isNull);
        _expectNoDeclarations();
        await fixture.setGate(tester, true);
        final staleSubmit = tester.widget<FilledButton>(submit).onPressed!;
        await fixture.setGate(tester, false);
        staleSubmit();
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byType(TextField).first,
          'Revised private draft',
        );
        await tester.pumpAndSettle();
        expect(fixture.registry.draft(scope)?['body'], 'Revised private draft');
        fixture.expectNoWrites();
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('reply keyboard and button cannot send a restored declaration', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.container.dispose);
    await fixture.seed('comment-create:draft-owner:post-a');
    await fixture.mount(tester, const CommentThreadScreen(postId: 'post-a'));
    final input = find.byType(TextField).first;
    expect(tester.widget<TextField>(input).enabled, isTrue);
    expect(tester.widget<TextField>(input).onSubmitted, isNull);
    _expectNoDeclarations();
    expect(
      find.text('Under review. Publication checks are pending.'),
      findsOneWidget,
    );
    await fixture.setGate(tester, true);
    final staleSend = tester.widget<TextField>(input).onSubmitted!;
    await fixture.setGate(tester, false);
    staleSend('Restored synthetic draft');
    await tester.pumpAndSettle();
    await tester.enterText(input, 'Saved reply draft');
    await tester.pumpAndSettle();
    expect(
      fixture.registry.draft('comment-create:draft-owner:post-a')?['body'],
      'Saved reply draft',
    );
    fixture.expectNoWrites();
    expect(tester.takeException(), isNull);
  });

  testWidgets('native Back closes the end drawer without closing a draft', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.container.dispose);
    await fixture.seed('post-create:draft-owner');
    final scaffold = GlobalKey<ScaffoldState>();
    await fixture.mount(
      tester,
      Scaffold(
        key: scaffold,
        endDrawer: const Drawer(child: Text('Secondary destinations')),
        body: const CreatePostScreen(),
      ),
    );
    scaffold.currentState!.openEndDrawer();
    await tester.pumpAndSettle();
    expect(scaffold.currentState!.isEndDrawerOpen, isTrue);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(scaffold.currentState!.isEndDrawerOpen, isFalse);
    expect(find.byType(CreatePostScreen), findsOneWidget);
    expect(find.text('Discard post?'), findsNothing);
    expect(
      fixture.container.read(postCreationProvider).text,
      'Restored synthetic draft',
    );
    fixture.expectNoWrites();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'an offstage draft does not block another route from going back',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.container.dispose);
      await fixture.seed('post-create:draft-owner');
      await fixture.mount(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => const Scaffold(
                    body: IndexedStack(
                      index: 1,
                      children: [
                        TickerMode(enabled: false, child: CreatePostScreen()),
                        Text('Another active destination'),
                      ],
                    ),
                  ),
                ),
              ),
              child: const Text('Open destinations'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open destinations'));
      await tester.pumpAndSettle();
      expect(find.text('Another active destination'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Open destinations'), findsOneWidget);
      expect(find.text('Another active destination'), findsNothing);
      expect(find.text('Discard post?'), findsNothing);
      expect(
        fixture.registry.draft('post-create:draft-owner')?['body'],
        'Restored synthetic draft',
      );
      fixture.expectNoWrites();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('detail keeps pending moderation without an authorship badge', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.container.dispose);
    when(
      () => fixture.repository.getPost(
        postId: 'post-a',
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => domain.Post(
        id: 'post-a',
        authorId: 'draft-owner',
        authorUsername: 'Synthetic owner',
        text: 'Private reviewed post',
        createdAt: DateTime.utc(2026),
        moderationState: 'under_review',
        declaredCreationMode: 'human',
      ),
    );
    await fixture.mount(tester, const PostDetailScreen(postId: 'post-a'));
    _expectNoDeclarations();
    expect(
      find.text('Under review. Publication checks are pending.'),
      findsOneWidget,
    );
    expect(find.text('Private reviewed post'), findsOneWidget);
    fixture.expectNoWrites();
    expect(tester.takeException(), isNull);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/ui/components/create_post_modal.dart';
import 'package:lythaus/ui/screens/create/create_modal.dart';
import 'package:lythaus/ui/screens/create/create_screen.dart';

class _FakePostCreationNotifier extends PostCreationNotifier {
  _FakePostCreationNotifier({required this.submitFn, required Ref ref})
    : resetCalled = false,
      super(ref);

  final Future<bool> Function(_FakePostCreationNotifier) submitFn;
  int submitCalls = 0;
  bool resetCalled;

  @override
  Future<bool> submit() async {
    submitCalls++;
    return submitFn(this);
  }

  @override
  void updateText(String text) {
    state = state.copyWith(text: text, clearResult: true);
  }

  @override
  void setIsNews(bool value) {
    state = state.copyWith(isNews: value, clearResult: true);
  }

  @override
  void setContentType(String value) {
    state = state.copyWith(contentType: value, clearResult: true);
  }

  @override
  void updateMediaUrl(String? url) {
    state = state.copyWith(
      mediaUrl: url,
      clearResult: true,
      clearMediaUrl: url == null || url.isEmpty,
    );
  }

  @override
  void reset() {
    resetCalled = true;
    state = const PostCreationState();
  }
}

class _Harness {
  _Harness({
    required this.container,
    required this.notifier,
    required this.widget,
  });

  final ProviderContainer container;
  final _FakePostCreationNotifier notifier;
  final Widget widget;

  void dispose() => container.dispose();
}

_Harness _buildHarness({
  required Future<bool> Function(_FakePostCreationNotifier) submitFn,
  PostCreationState? initialState,
  bool canCreate = true,
}) {
  late _FakePostCreationNotifier notifier;

  final container = ProviderContainer(
    overrides: [
      postCreationProvider.overrideWith((ref) {
        notifier = _FakePostCreationNotifier(submitFn: submitFn, ref: ref);
        return notifier;
      }),
      canCreatePostProvider.overrideWithValue(canCreate),
    ],
  );

  final widget = UncontrolledProviderScope(
    container: container,
    child: const MaterialApp(home: Scaffold(body: CreatePostModal())),
  );

  notifier =
      container.read(postCreationProvider.notifier)
          as _FakePostCreationNotifier;
  if (initialState != null) {
    notifier.state = initialState;
  }

  addTearDown(() => container.dispose());

  return _Harness(container: container, notifier: notifier, widget: widget);
}

void main() {
  testWidgets('submits post and resets on success', (tester) async {
    final harness = _buildHarness(
      submitFn: (n) async {
        n.state = n.state.copyWith(
          result: CreatePostSuccess(
            Post(
              id: 'p1',
              authorId: 'u1',
              authorUsername: 'user',
              text: n.state.text,
              createdAt: DateTime.now(),
            ),
          ),
        );
        return true;
      },
    );

    await tester.pumpWidget(harness.widget);

    await tester.enterText(find.byType(TextField).first, 'Hello Lythaus');
    await tester.tap(find.text('Post'));
    await tester.pumpAndSettle();

    expect(harness.notifier.submitCalls, 1);
    expect(harness.notifier.resetCalled, isTrue);
  });

  testWidgets('shows AI scan sheet when content is blocked', (tester) async {
    final harness = _buildHarness(
      submitFn: (n) async {
        n.state = n.state.copyWith(
          result: const CreatePostBlocked(
            message: 'blocked',
            categories: ['harm'],
          ),
        );
        return false;
      },
      initialState: const PostCreationState(text: 'blocked text'),
    );

    await tester.pumpWidget(harness.widget);
    await tester.tap(find.text('Post'));
    await tester.pumpAndSettle();

    expect(find.text('AI Scan'), findsOneWidget);
    expect(find.text('blocked'), findsOneWidget);
    expect(find.text('harm'), findsOneWidget);
  });

  testWidgets('shows limit sheet when post limit exceeded', (tester) async {
    final harness = _buildHarness(
      submitFn: (n) async {
        n.state = n.state.copyWith(
          result: const CreatePostLimitExceeded(
            message: 'Too many posts',
            limit: 5,
            currentCount: 5,
            tier: 'free',
            retryAfter: Duration(minutes: 10),
          ),
        );
        return false;
      },
      initialState: const PostCreationState(text: 'limit'),
    );

    await tester.pumpWidget(harness.widget);
    await tester.tap(find.text('Post'));
    await tester.pumpAndSettle();

    expect(find.text('Post limit reached'), findsOneWidget);
    expect(find.textContaining('Limit: 5'), findsOneWidget);
    expect(find.textContaining('Retry after: 10 minutes'), findsOneWidget);
  });

  testWidgets('attaches media via picker', (tester) async {
    final harness = _buildHarness(submitFn: (n) async => false);

    await tester.pumpWidget(harness.widget);
    await tester.tap(find.text('Add media'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).last,
      'https://example.com/img.jpg',
    );
    await tester.tap(find.text('Attach'));
    await tester.pumpAndSettle();

    expect(harness.notifier.state.mediaUrl, 'https://example.com/img.jpg');
  });

  testWidgets('CreateModalScreen.show opens create post screen', (
    tester,
  ) async {
    final harness = _buildHarness(submitFn: (n) async => false);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: harness.container,
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => CreateModalScreen.show(context),
                child: const Text('Open modal'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open modal'));
    await tester.pumpAndSettle();

    expect(find.byType(CreatePostScreen), findsOneWidget);
  });

  testWidgets('CreateScreen renders create post screen', (tester) async {
    final harness = _buildHarness(submitFn: (n) async => false);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: harness.container,
        child: const MaterialApp(home: CreateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(AppBar), findsOneWidget);
    expect(find.byType(CreatePostScreen), findsOneWidget);
  });
}

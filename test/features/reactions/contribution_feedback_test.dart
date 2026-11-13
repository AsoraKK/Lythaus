import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/reactions/application/contribution_feedback_controller.dart';
import 'package:lythaus/features/reactions/domain/contribution_feedback.dart';
import 'package:lythaus/features/reactions/presentation/contribution_feedback_controls.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/interactive_feed_card.dart';

import '../../helpers/content_recovery.dart';
import '../../helpers/feed_session.dart';

class _PostRepo extends Mock implements PostRepository {}

class _Dio extends Mock implements Dio {}

class _FeedbackService extends ContributionFeedbackService {
  _FeedbackService() : super(Dio());
  final values = <String, Map<FeedbackTarget, Map<FeedbackChannel, String?>>>{};
  final keys = <String>[];
  final completed = <String>{};
  bool failAfterCommit = false;
  Completer<void>? delayRead;

  Map<FeedbackChannel, String?> _values(String actor, FeedbackTarget target) =>
      (values[actor] ??= {})[target] ??= {};

  @override
  Future<ContributionFeedbackSummary> read(
    FeedbackTarget target,
    String? token,
  ) async {
    final delay = delayRead;
    if (delay != null) await delay.future;
    final all = [for (final actor in values.keys) _values(actor, target)];
    final own = token == null
        ? <FeedbackChannel, String?>{}
        : _values(token, target);
    return ContributionFeedbackSummary(
      qualityCounts: {
        for (final vote in QualityVote.values)
          vote: all
              .where((row) => row[FeedbackChannel.quality] == vote.name)
              .length,
      },
      emotionCounts: {
        for (final emotion in ContentEmotion.values)
          emotion: all
              .where((row) => row[FeedbackChannel.emotion] == emotion.name)
              .length,
      },
      myQuality: QualityVote.values
          .where((item) => item.name == own[FeedbackChannel.quality])
          .firstOrNull,
      myEmotion: ContentEmotion.values
          .where((item) => item.name == own[FeedbackChannel.emotion])
          .firstOrNull,
    );
  }

  @override
  Future<void> change(
    FeedbackTarget target,
    FeedbackChannel channel,
    String? value,
    String token,
    String key,
  ) async {
    keys.add(key);
    if (completed.add(key)) _values(token, target)[channel] = value;
    if (failAfterCommit) {
      failAfterCommit = false;
      throw DioException(
        requestOptions: RequestOptions(path: '/feedback'),
        type: DioExceptionType.receiveTimeout,
      );
    }
  }
}

Widget _app(
  _FeedbackService service,
  FeedTestAuth auth, {
  double scale = 1,
  bool twoViews = false,
  Widget? child,
  List<Override> extra = const [],
}) {
  const target = FeedbackTarget(FeedbackTargetType.post, 'post-a');
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => auth),
      jwtProvider.overrideWith(
        (ref) async => ref.watch(currentUserProvider)?.id,
      ),
      contentRecoveryStorageProvider.overrideWithValue(
        MemoryContentRecoveryStorage(),
      ),
      contributionFeedbackServiceProvider.overrideWithValue(service),
      contributionFeedbackCandidateProvider.overrideWithValue(true),
      ...extra,
    ],
    child: MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(320, 800),
          textScaler: TextScaler.linear(scale),
        ),
        child:
            child ??
            Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    const ContributionFeedbackControls(
                      target: target,
                      authorId: 'author',
                    ),
                    if (twoViews)
                      const ContributionFeedbackControls(
                        target: target,
                        authorId: 'author',
                      ),
                  ],
                ),
              ),
            ),
      ),
    ),
  );
}

void main() {
  setUpAll(() => registerFallbackValue(Options()));
  test('parser rejects missing or mismatched server state', () {
    const target = FeedbackTarget(FeedbackTargetType.post, 'post-a');
    expect(
      () => ContributionFeedbackSummary.fromJson({
        'target': {'type': 'comment', 'id': 'post-a'},
      }, target),
      throwsFormatException,
    );
    expect(
      () => ContributionFeedbackSummary.fromJson({
        'target': {'type': 'post', 'id': 'post-a'},
        'quality': {
          'counts': {'like': -1, 'dislike': 0},
          'myValue': null,
        },
        'emotion': {
          'counts': {
            'amused': 0,
            'sad': 0,
            'angry': 0,
            'surprised': 0,
            'appreciative': 0,
          },
          'myValue': null,
        },
      }, target),
      throwsFormatException,
    );
  });

  testWidgets('quality and emotion are independent and shared between views', (
    tester,
  ) async {
    final service = _FeedbackService();
    await tester.pumpWidget(
      _app(service, FeedTestAuth(feedTestUser('alice')), twoViews: true),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Like 0').first);
    await tester.pumpAndSettle();
    expect(find.text('Like 1'), findsNWidgets(2));
    await tester.tap(find.textContaining('React to content').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('😢 0'));
    await tester.pumpAndSettle();
    expect(find.text('Like 1'), findsNWidgets(2));
    expect(find.text('😢 1'), findsOneWidget);
    final values =
        service.values['alice']![const FeedbackTarget(
          FeedbackTargetType.post,
          'post-a',
        )]!;
    expect(values[FeedbackChannel.quality], 'like');
    expect(values[FeedbackChannel.emotion], 'sad');
  });

  testWidgets('uncertain changes retry the same key after an account switch', (
    tester,
  ) async {
    final service = _FeedbackService()..failAfterCommit = true;
    final auth = FeedTestAuth(feedTestUser('alice'));
    await tester.pumpWidget(_app(service, auth));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dislike 0'));
    await tester.pumpAndSettle();
    expect(find.text('Retry saved change'), findsOneWidget);
    auth.change(AsyncData(feedTestUser('bob')));
    await tester.pumpAndSettle();
    expect(find.text('Retry saved change'), findsNothing);
    auth.change(AsyncData(feedTestUser('alice')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Select the previous quality choice'),
      findsOneWidget,
    );
    await tester.tap(find.text('Dislike').last);
    await tester.pumpAndSettle();
    expect(service.keys.length, 2);
    expect(service.keys[1], service.keys[0]);
    expect(find.text('Dislike 1'), findsOneWidget);
    expect(find.textContaining('previous quality choice'), findsNothing);
  });

  testWidgets('narrow layout supports doubled text and semantics', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      _app(_FeedbackService(), FeedTestAuth(feedTestUser('alice')), scale: 2),
    );
    await tester.pumpAndSettle();
    expect(find.text('Like 0'), findsOneWidget);
    expect(find.text('Dislike 0'), findsOneWidget);
    await tester.tap(find.textContaining('React to content'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Sad, 0 reactions'), findsOneWidget);
    expect(tester.takeException(), isNull);
    handle.dispose();
  });

  testWidgets('feed and post detail use the same confirmed feedback', (
    tester,
  ) async {
    final service = _FeedbackService();
    final repo = _PostRepo();
    final post = domain.Post(
      id: 'post-a',
      authorId: 'author',
      authorUsername: 'Writer',
      text: 'Detailed contribution',
      createdAt: DateTime.utc(2026),
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      trustStatus: 'clean',
      timeline: const domain.PostTrustTimeline(),
      isNews: false,
      userLiked: false,
      userDisliked: false,
      hasAppeal: false,
      proofSignalsProvided: false,
      verifiedContextBadgeEligible: false,
      featuredEligible: false,
      moderationState: 'allowed',
    );
    when(
      () => repo.getPost(postId: 'post-a', token: 'alice'),
    ).thenAnswer((_) async => post);
    final item = FeedItem(
      id: 'post-a',
      feedId: 'discover',
      author: 'Writer',
      authorId: 'author',
      contentType: ContentType.text,
      title: '',
      body: 'Feed contribution',
      publishedAt: DateTime.utc(2026),
    );
    await tester.pumpWidget(
      _app(
        service,
        FeedTestAuth(feedTestUser('alice')),
        extra: [
          postRepositoryProvider.overrideWithValue(repo),
          feedBookmarksProvider.overrideWith((ref) async => {}),
        ],
        child: Scaffold(
          body: Builder(
            builder: (context) => SingleChildScrollView(
              child: InteractiveFeedCard(
                item: item,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PostDetailScreen(postId: 'post-a'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Like 0'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Feed contribution'));
    await tester.pumpAndSettle();
    expect(find.text('Detailed contribution'), findsOneWidget);
    expect(find.text('Like 1'), findsOneWidget);
    await tester.tap(find.textContaining('React to content'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('😢 0'));
    await tester.pumpAndSettle();
    expect(find.text('Like 1'), findsOneWidget);
    expect(find.text('😢 1'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Like 1'), findsOneWidget);
    expect(find.text('React to content · 1'), findsOneWidget);
  });

  testWidgets('comment controls address the comment, not its post', (
    tester,
  ) async {
    final service = _FeedbackService();
    final dio = _Dio();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        requestOptions: RequestOptions(path: '/api/posts/post-a/comments'),
        data: {
          'items': [
            {
              'id': 'comment-a',
              'postId': 'post-a',
              'authorId': 'author',
              'authorUsername': 'Writer',
              'body': 'A thoughtful reply',
              'declaredCreationMode': 'human',
              'moderationState': 'allowed',
              'createdAt': DateTime.utc(2026).toIso8601String(),
            },
          ],
          'capabilities': {'conversations': true, 'nestedReplies': true},
        },
      ),
    );
    await tester.pumpWidget(
      _app(
        service,
        FeedTestAuth(feedTestUser('alice')),
        extra: [secureDioProvider.overrideWithValue(dio)],
        child: const CommentThreadScreen(postId: 'post-a'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('A thoughtful reply'), findsOneWidget);
    await tester.tap(find.text('Dislike 0'));
    await tester.pumpAndSettle();
    expect(
      service.values['alice']![const FeedbackTarget(
        FeedbackTargetType.comment,
        'comment-a',
      )]![FeedbackChannel.quality],
      'dislike',
    );
    expect(
      service.values['alice']!.containsKey(
        const FeedbackTarget(FeedbackTargetType.post, 'comment-a'),
      ),
      isFalse,
    );
  });
}

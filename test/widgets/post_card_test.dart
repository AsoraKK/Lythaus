import 'package:lythaus/features/feed/application/post_insights_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/widgets/post_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Post _buildPost({
  required String id,
  required ModerationStatus status,
  String? appealStatus,
  DateTime? createdAt,
  List<String> mediaUrls = const [],
}) {
  return Post(
    id: id,
    title: 'Title',
    content: 'Post content',
    author: const Author(id: 'a1', displayName: 'Alice', reputationScore: 10),
    createdAt: createdAt ?? DateTime.now(),
    moderationStatus: status,
    appealStatus: appealStatus,
    mediaUrls: mediaUrls,
  );
}

void main() {
  testWidgets('shows moderation banner and time for own flagged post', (
    tester,
  ) async {
    final post = _buildPost(
      id: 'p1',
      status: ModerationStatus.flagged,
      createdAt: DateTime.now().subtract(const Duration(hours: 2)),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          postInsightsProvider(
            post.id,
          ).overrideWith((ref) => Future.value(InsightsAccessDenied())),
        ],
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post, isOwnPost: true)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('flagged by the community'), findsOneWidget);
    expect(find.textContaining('h ago'), findsOneWidget);
    expect(find.text('Appeal decision'), findsOneWidget);
    expect(find.text('Flagged'), findsOneWidget);
  });

  testWidgets('shows pending appeal message for hidden own post', (
    tester,
  ) async {
    final post = _buildPost(
      id: 'p2',
      status: ModerationStatus.hidden,
      appealStatus: 'pending',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          postInsightsProvider(
            post.id,
          ).overrideWith((ref) => Future.value(InsightsAccessDenied())),
        ],
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post, isOwnPost: true)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('blocked pending an appeal outcome'),
      findsOneWidget,
    );
    expect(find.text('Appeal Pending'), findsOneWidget);
  });

  testWidgets('shows hidden placeholder for non-own hidden post', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PostCard(
            post: Post(
              id: 'p3',
              title: 'Title',
              content: 'Hidden content',
              author: const Author(id: 'a1', displayName: 'Alice'),
              createdAt: DateTime(2024, 1, 1),
              moderationStatus: ModerationStatus.hidden,
            ),
            isOwnPost: false,
          ),
        ),
      ),
    );

    expect(find.text('Content Hidden'), findsOneWidget);
    expect(find.text('Hidden content'), findsNothing);
  });

  testWidgets('renders media gallery for multiple images', (tester) async {
    final post = _buildPost(
      id: 'p4',
      status: ModerationStatus.clean,
      mediaUrls: const [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: PostCard(post: post)),
      ),
    );

    expect(find.byType(Image), findsNWidgets(2));
  });

  testWidgets('renders single media image preview', (tester) async {
    final post = _buildPost(
      id: 'p5',
      status: ModerationStatus.clean,
      mediaUrls: const ['https://example.com/a.jpg'],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: PostCard(post: post)),
      ),
    );

    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('shows community approved banner without appeal action', (
    tester,
  ) async {
    final post = _buildPost(
      id: 'p6',
      status: ModerationStatus.communityApproved,
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post, isOwnPost: true)),
        ),
      ),
    );

    expect(find.textContaining('community voted to approve'), findsOneWidget);
    expect(find.text('Appeal decision'), findsNothing);
  });

  testWidgets('hides appeal action when appeal status is set', (tester) async {
    final post = _buildPost(
      id: 'p7',
      status: ModerationStatus.communityRejected,
      appealStatus: 'pending',
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post, isOwnPost: true)),
        ),
      ),
    );

    expect(find.textContaining('community voted to keep'), findsOneWidget);
    expect(find.text('Appeal decision'), findsNothing);
  });

  testWidgets('formats time ago for days and minutes', (tester) async {
    final now = DateTime.now();
    final dayPost = _buildPost(
      id: 'p8',
      status: ModerationStatus.clean,
      createdAt: now.subtract(const Duration(days: 2)),
    );
    final minutePost = _buildPost(
      id: 'p9',
      status: ModerationStatus.clean,
      createdAt: now.subtract(const Duration(minutes: 5)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              PostCard(post: dayPost),
              PostCard(post: minutePost),
            ],
          ),
        ),
      ),
    );

    expect(find.text('2d ago'), findsOneWidget);
    expect(find.text('5m ago'), findsOneWidget);
  });

  testWidgets('dismisses moderation banner when close pressed', (tester) async {
    final post = _buildPost(id: 'p10', status: ModerationStatus.flagged);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post, isOwnPost: true)),
        ),
      ),
    );

    expect(find.textContaining('flagged by the community'), findsOneWidget);
    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pumpAndSettle();

    expect(find.textContaining('flagged by the community'), findsNothing);
  });
}

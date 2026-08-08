import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows pinned icon, label, and author when feed item is pinned', (
    tester,
  ) async {
    final feedItem = FeedItem(
      id: 'feed-1',
      feedId: 'home',
      author: 'Alice',
      contentType: ContentType.image,
      title: 'Pinned update',
      body: 'Details about the pinned post',
      publishedAt: DateTime.utc(2025, 1, 1),
      imageUrl: 'https://example.com/image.png',
      tags: const ['breaking'],
      isPinned: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedCard(item: feedItem, onTap: () {}),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.push_pin_outlined), findsOneWidget);
    expect(find.text('Image'), findsOneWidget);
    expect(find.text('Alice'), findsOneWidget);
  });

  testWidgets(
    'hides source text when requested and shows video preview badge',
    (tester) async {
      final feedItem = FeedItem(
        id: 'feed-2',
        feedId: 'news',
        author: 'Bob',
        contentType: ContentType.video,
        title: 'Stream highlight',
        body: 'Short video recap',
        publishedAt: DateTime.utc(2025, 1, 2),
        videoThumbnailUrl: 'https://example.com/thumb.jpg',
        tags: const ['video'],
        isPinned: false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FeedCard(item: feedItem, onTap: () {}, showSource: false),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Preview'), findsOneWidget);
      expect(find.text('Bob'), findsNothing);
      expect(find.text('Video'), findsOneWidget);
    },
  );

  testWidgets('renders text content label and tags without media', (
    tester,
  ) async {
    final feedItem = FeedItem(
      id: 'feed-3',
      feedId: 'home',
      author: 'Cora',
      contentType: ContentType.text,
      title: 'Plain update',
      body: 'Short text body',
      publishedAt: DateTime.utc(2025, 1, 3),
      tags: const ['update'],
      isPinned: false,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedCard(item: feedItem, onTap: () {}),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Text'), findsOneWidget);
    expect(find.text('update'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('renders mixed content label', (tester) async {
    final feedItem = FeedItem(
      id: 'feed-4',
      feedId: 'mixed',
      author: 'Dana',
      contentType: ContentType.mixed,
      title: 'Mixed update',
      body: 'Body content',
      publishedAt: DateTime.utc(2025, 1, 4),
      tags: const ['mixed'],
      isPinned: false,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedCard(item: feedItem, onTap: () {}),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Mixed'), findsOneWidget);
  });

  testWidgets('shows source metadata label and link indicator for news item', (
    tester,
  ) async {
    final feedItem = FeedItem(
      id: 'feed-5',
      feedId: 'news',
      author: 'Reporter Name',
      sourceName: 'Reuters',
      sourceUrl: 'https://www.reuters.com/world/',
      contentType: ContentType.text,
      title: 'News headline',
      body: 'News body',
      publishedAt: DateTime.utc(2025, 1, 5),
      isNews: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedCard(item: feedItem, onTap: () {}),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Reuters'), findsOneWidget);
    expect(find.text('Reporter Name'), findsNothing);
    expect(find.byIcon(Icons.link), findsOneWidget);
  });
}

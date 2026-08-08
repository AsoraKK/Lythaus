import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/widgets/post_card.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

void main() {
  testWidgets('PostCard does not render AI score badges', (tester) async {
    final post = Post(
      id: 'post-1',
      title: 'Test Post',
      content: 'Test content',
      author: const Author(
        id: 'author-1',
        displayName: 'Tester',
        reputationScore: 120,
      ),
      createdAt: DateTime(2025, 1, 1),
      moderationStatus: ModerationStatus.flagged,
      authorshipLabel: 'Under review',
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: PostCard(post: post)),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Under review'), findsOneWidget);
    expect(find.textContaining('0.92'), findsNothing);
    expect(find.textContaining('%'), findsNothing);
  });
}

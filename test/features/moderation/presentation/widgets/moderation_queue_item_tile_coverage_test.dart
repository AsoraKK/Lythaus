// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_queue_item_tile.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

  ModerationQueueItem item({
    ModerationItemType type = ModerationItemType.flag,
    ModerationSeverityLevel severity = ModerationSeverityLevel.high,
    String? contentTitle,
    String? authorHandle,
    String? aiRiskBand,
    bool isEscalated = false,
  }) => ModerationQueueItem(
    id: 'item-1',
    type: type,
    contentId: 'c1',
    contentType: 'post',
    contentPreview: 'Preview text here',
    createdAt: DateTime.now().subtract(const Duration(minutes: 30)),
    severity: severity,
    status: 'pending',
    queue: 'general_review',
    reportCount: 3,
    communityVotes: 5,
    isEscalated: isEscalated,
    contentTitle: contentTitle,
    authorHandle: authorHandle,
    aiRiskBand: aiRiskBand,
  );

  group('ModerationQueueItemTile', () {
    testWidgets('renders flag item with high severity', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(contentTitle: 'Bad Post Title'),
            onTap: () => tapped = true,
          ),
        ),
      );
      expect(find.text('Bad Post Title'), findsOneWidget);
      expect(find.text('Preview text here'), findsAtLeast(1));
      expect(find.text('HIGH'), findsOneWidget);
      expect(find.text('General Review'), findsOneWidget);
      expect(find.text('3 flags'), findsOneWidget);
      expect(find.text('5 community votes'), findsOneWidget);
      expect(find.byIcon(Icons.flag_outlined), findsAtLeast(1));

      await tester.tap(find.byType(InkWell).first);
      expect(tapped, isTrue);
    });

    testWidgets('renders appeal item with appeal icon', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(type: ModerationItemType.appeal),
            onTap: () {},
          ),
        ),
      );
      expect(find.byIcon(Icons.how_to_vote), findsOneWidget);
    });

    testWidgets('falls back to contentPreview when no title', (tester) async {
      await tester.pumpWidget(
        wrap(ModerationQueueItemTile(item: item(), onTap: () {})),
      );
      expect(find.text('Preview text here'), findsAtLeast(1));
    });

    testWidgets('shows aiRiskBand chip when present', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(aiRiskBand: 'Critical'),
            onTap: () {},
          ),
        ),
      );
      expect(find.text('Critical'), findsOneWidget);
    });

    testWidgets('shows Escalated chip when escalated', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(item: item(isEscalated: true), onTap: () {}),
        ),
      );
      expect(find.text('Escalated'), findsOneWidget);
    });

    testWidgets('shows authorHandle when present', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(authorHandle: '@kylee'),
            onTap: () {},
          ),
        ),
      );
      expect(find.textContaining('@kylee'), findsOneWidget);
    });

    testWidgets('shows Unknown author when no handle', (tester) async {
      await tester.pumpWidget(
        wrap(ModerationQueueItemTile(item: item(), onTap: () {})),
      );
      expect(find.textContaining('Unknown author'), findsOneWidget);
    });

    testWidgets('renders medium severity color', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(severity: ModerationSeverityLevel.medium),
            onTap: () {},
          ),
        ),
      );
      expect(find.text('MEDIUM'), findsOneWidget);
    });

    testWidgets('renders low severity color', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(severity: ModerationSeverityLevel.low),
            onTap: () {},
          ),
        ),
      );
      expect(find.text('LOW'), findsOneWidget);
    });

    testWidgets('renders unknown severity color', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationQueueItemTile(
            item: item(severity: ModerationSeverityLevel.unknown),
            onTap: () {},
          ),
        ),
      );
      expect(find.text('UNKNOWN'), findsOneWidget);
    });
  });
}

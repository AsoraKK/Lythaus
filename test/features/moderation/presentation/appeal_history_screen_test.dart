import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';

Appeal _appeal({
  required String id,
  required String contentType,
  String? contentTitle,
  required VotingStatus status,
  required DateTime submittedAt,
  required int urgencyScore,
  VotingProgress? progress,
}) {
  return Appeal(
    appealId: id,
    contentId: 'content-$id',
    contentType: contentType,
    contentTitle: contentTitle,
    contentPreview: 'Preview for $id',
    appealType: 'content_review',
    appealReason: 'User appeal reason for $id',
    userStatement: 'Statement for $id',
    submitterId: 'user-$id',
    submitterName: 'User $id',
    submittedAt: submittedAt,
    expiresAt: submittedAt.add(const Duration(days: 7)),
    flagReason: 'harassment',
    authorshipLabel: 'Under review',
    classificationSource: 'automated_classification',
    flagCategories: const ['abuse'],
    flagCount: 2,
    votingStatus: status,
    votingProgress: progress,
    urgencyScore: urgencyScore,
    estimatedResolution: 'Soon',
    hasUserVoted: false,
    userVote: null,
    canUserVote: true,
    voteIneligibilityReason: null,
  );
}

VotingProgress _progress({
  required int total,
  required int approve,
  required int reject,
  String? remaining,
}) {
  final approvalRate = total == 0 ? 0.0 : (approve / total * 100);
  return VotingProgress(
    totalVotes: total,
    approveVotes: approve,
    rejectVotes: reject,
    approvalRate: approvalRate,
    quorumMet: total >= 5,
    timeRemaining: remaining,
    estimatedResolution: '1h',
    voteBreakdown: const [],
  );
}

void main() {
  testWidgets('AppealHistoryScreen renders data, tabs, and details', (
    tester,
  ) async {
    final now = DateTime.now();
    final appeals = [
      _appeal(
        id: 'a1',
        contentType: 'post',
        contentTitle: 'Appeal title',
        status: VotingStatus.active,
        submittedAt: now.subtract(const Duration(days: 10)),
        urgencyScore: 85,
        progress: _progress(total: 12, approve: 9, reject: 3, remaining: '2h'),
      ),
      _appeal(
        id: 'a2',
        contentType: 'comment',
        status: VotingStatus.active,
        submittedAt: now.subtract(const Duration(days: 2)),
        urgencyScore: 65,
        progress: _progress(total: 0, approve: 0, reject: 0),
      ),
      _appeal(
        id: 'a3',
        contentType: 'user',
        status: VotingStatus.resolved,
        submittedAt: now.subtract(const Duration(hours: 6)),
        urgencyScore: 45,
      ),
      _appeal(
        id: 'a4',
        contentType: 'other',
        status: VotingStatus.timeExpired,
        submittedAt: now.subtract(const Duration(minutes: 5)),
        urgencyScore: 20,
      ),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [myAppealsProvider.overrideWith((ref) async => appeals)],
        child: const MaterialApp(home: AppealHistoryScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('My Appeals'), findsOneWidget);
    expect(find.text('Appeal title'), findsOneWidget);
    expect(find.text('Urgency: Critical'), findsOneWidget);

    await tester.tap(find.text('View Details').first);
    await tester.pumpAndSettle();
    expect(find.text('Appeal Details'), findsOneWidget);

    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Active'));
    await tester.pumpAndSettle();

    expect(find.text('Community Voting Progress'), findsWidgets);
    expect(find.textContaining('votes'), findsWidgets);

    await tester.tap(find.text('Analytics'));
    await tester.pumpAndSettle();

    expect(find.text('Appeals by Content Type'), findsOneWidget);
    expect(find.text('Appeals by Status'), findsOneWidget);
  });

  testWidgets('AppealHistoryScreen shows empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [myAppealsProvider.overrideWith((ref) async => [])],
        child: const MaterialApp(home: AppealHistoryScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('No appeals yet'), findsOneWidget);

    await tester.tap(find.text('Submit First Appeal'));
    await tester.pump();
    expect(
      find.text('Open a blocked post and tap Appeal to submit a new case.'),
      findsOneWidget,
    );
  });

  testWidgets('AppealHistoryScreen shows error state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          myAppealsProvider.overrideWith(
            (ref) => Future.error(Exception('Network down')),
          ),
        ],
        child: const MaterialApp(home: AppealHistoryScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Failed to load appeals'), findsOneWidget);
    expect(find.textContaining('Network down'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}

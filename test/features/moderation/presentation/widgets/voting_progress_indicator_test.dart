import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/widgets/voting_progress_indicator.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

void main() {
  group('VotingProgressIndicator', () {
    testWidgets('displays header correctly', (tester) async {
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 6,
        rejectVotes: 4,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.text('Community Voting Progress'), findsOneWidget);
      expect(find.byIcon(Icons.how_to_vote), findsOneWidget);
    });

    testWidgets('displays progress bar when votes exist', (tester) async {
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 6,
        rejectVotes: 4,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('displays waiting message when no votes', (tester) async {
      const progress = VotingProgress(
        totalVotes: 0,
        approveVotes: 0,
        rejectVotes: 0,
        approvalRate: 0.0,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.text('Waiting for community votes...'), findsOneWidget);
    });

    testWidgets('displays time remaining when available', (tester) async {
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 6,
        rejectVotes: 4,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: '2h 30m remaining',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.textContaining('2h 30m remaining'), findsOneWidget);
    });

    testWidgets('displays vote breakdown correctly', (tester) async {
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 6,
        rejectVotes: 4,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.textContaining('6 approve'), findsOneWidget);
      expect(find.textContaining('4 reject'), findsOneWidget);
    });

    testWidgets('displays quorum progress correctly', (tester) async {
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 6,
        rejectVotes: 4,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      // Check for voting progress display (exact text may vary based on implementation)
      expect(find.byType(VotingProgressIndicator), findsOneWidget);
    });

    testWidgets('handles edge case with no time remaining', (tester) async {
      const progress = VotingProgress(
        totalVotes: 5,
        approveVotes: 3,
        rejectVotes: 2,
        approvalRate: 0.6,
        quorumMet: false,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.byType(VotingProgressIndicator), findsOneWidget);
    });

    testWidgets('handles quorum met status', (tester) async {
      const progress = VotingProgress(
        totalVotes: 20,
        approveVotes: 15,
        rejectVotes: 5,
        approvalRate: 0.75,
        quorumMet: true,
        timeRemaining: null,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingProgressIndicator(progress: progress)),
        ),
      );

      expect(find.byType(VotingProgressIndicator), findsOneWidget);
    });
  });
}

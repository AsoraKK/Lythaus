import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/presentation/widgets/voting_status_badge.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

void main() {
  group('VotingStatusBadge', () {
    testWidgets('displays active voting status correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingStatusBadge(status: VotingStatus.active)),
        ),
      );

      expect(find.text('Active Voting'), findsOneWidget);
      expect(find.byIcon(Icons.how_to_vote), findsOneWidget);
    });

    testWidgets('displays quorum reached status correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VotingStatusBadge(status: VotingStatus.quorumReached),
          ),
        ),
      );

      expect(find.text('Quorum Reached'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('displays time expired status correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VotingStatusBadge(status: VotingStatus.timeExpired),
          ),
        ),
      );

      expect(find.text('Time Expired'), findsOneWidget);
      expect(find.byIcon(Icons.access_time), findsOneWidget);
    });

    testWidgets('displays resolved status correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: VotingStatusBadge(status: VotingStatus.resolved),
          ),
        ),
      );

      expect(find.text('Resolved'), findsOneWidget);
      expect(find.byIcon(Icons.verified), findsOneWidget);
    });

    testWidgets('has correct styling for active status', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: VotingStatusBadge(status: VotingStatus.active)),
        ),
      );

      final container = tester.widget<Container>(find.byType(Container));
      final decoration = container.decoration as BoxDecoration;

      expect(decoration.borderRadius, BorderRadius.circular(32));
      expect(decoration.border, isA<Border>());
    });

    group('StatusInfo', () {
      test('creates status info with required properties', () {
        final statusInfo = StatusInfo(
          color: Colors.blue,
          icon: Icons.info,
          label: 'Test Label',
        );

        expect(statusInfo.color, equals(Colors.blue));
        expect(statusInfo.icon, equals(Icons.info));
        expect(statusInfo.label, equals('Test Label'));
      });
    });
  });
}

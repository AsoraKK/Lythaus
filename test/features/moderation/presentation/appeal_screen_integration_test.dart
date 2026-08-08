import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/presentation/widgets/appeal_card.dart';

// LYTHAUS APPEAL SCREEN INTEGRATION TESTS
//
// 🎯 Purpose: Test complete screen behavior with different states
// ✅ Coverage: Loading, error, data states, user interactions
// 🧪 Test Types: Integration tests for screen-level behavior
// 📱 Platform: Flutter with widget integration testing

// Mock service class for integration testing
class MockAppealService {
  bool _shouldReturnError = false;
  bool _shouldReturnEmpty = false;
  Duration _delay = Duration.zero;
  List<Appeal> _mockAppeals = [];

  void setShouldReturnError(bool shouldError) {
    _shouldReturnError = shouldError;
  }

  void setShouldReturnEmpty(bool shouldReturnEmpty) {
    _shouldReturnEmpty = shouldReturnEmpty;
  }

  void setDelay(Duration delay) {
    _delay = delay;
  }

  void setMockAppeals(List<Appeal> appeals) {
    _mockAppeals = appeals;
  }

  Future<List<Appeal>> fetchAppeals() async {
    await Future<void>.delayed(_delay);

    if (_shouldReturnError) {
      throw Exception('Network error');
    }

    if (_shouldReturnEmpty) {
      return [];
    }

    return _mockAppeals;
  }
}

// Mock screen widget that simulates appeal list behavior
class MockAppealListScreen extends StatefulWidget {
  final MockAppealService service;

  const MockAppealListScreen({super.key, required this.service});

  @override
  State<MockAppealListScreen> createState() => _MockAppealListScreenState();
}

class _MockAppealListScreenState extends State<MockAppealListScreen> {
  bool _isLoading = true;
  String? _error;
  List<Appeal> _appeals = [];

  @override
  void initState() {
    super.initState();
    _loadAppeals();
  }

  Future<void> _loadAppeals() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final appeals = await widget.service.fetchAppeals();
      setState(() {
        _appeals = appeals;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Appeals')),
      body: _buildBody(),
      floatingActionButton: FloatingActionButton(
        onPressed: _loadAppeals,
        child: const Icon(Icons.refresh),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading appeals...'),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error, color: Colors.red, size: 64),
            const SizedBox(height: 16),
            Text(
              'Error loading appeals',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _loadAppeals, child: const Text('Retry')),
          ],
        ),
      );
    }

    if (_appeals.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox, color: Colors.grey, size: 64),
            SizedBox(height: 16),
            Text(
              'No appeals found',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
            ),
            SizedBox(height: 8),
            Text(
              'There are no appeals to review at the moment.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadAppeals,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _appeals.length,
        itemBuilder: (context, index) {
          final appeal = _appeals[index];
          return AppealCard(
            appeal: appeal,
            showProgress: true,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Tapped appeal ${appeal.appealId}')),
              );
            },
            onViewDetails: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('View details for ${appeal.appealId}')),
              );
            },
          );
        },
      ),
    );
  }
}

void main() {
  group('Appeal Screen Integration Tests', () {
    late MockAppealService service;
    late List<Appeal> testAppeals;

    setUp(() {
      service = MockAppealService();
      testAppeals = [
        Appeal(
          appealId: 'appeal_1',
          contentId: 'content_1',
          contentType: 'post',
          contentTitle: 'Integration Test Post',
          contentPreview: 'This is a test post for integration testing',
          appealType: 'false_positive',
          appealReason: 'This was incorrectly flagged by the system',
          userStatement: 'I believe this content follows all guidelines',
          submitterId: 'user_1',
          submitterName: 'Integration User',
          submittedAt: DateTime(2025, 8, 2, 15, 0),
          expiresAt: DateTime(2025, 8, 9, 15, 0),
          flagReason: 'inappropriate_content',
          flagCategories: ['spam', 'inappropriate'],
          flagCount: 3,
          votingStatus: VotingStatus.active,
          urgencyScore: 75,
          estimatedResolution: 'Today',
          hasUserVoted: false,
          canUserVote: true,
          votingProgress: const VotingProgress(
            totalVotes: 12,
            approveVotes: 8,
            rejectVotes: 4,
            approvalRate: 66.7,
            quorumMet: true,
            timeRemaining: '4 hours',
            estimatedResolution: 'Today',
          ),
        ),
        Appeal(
          appealId: 'appeal_2',
          contentId: 'content_2',
          contentType: 'comment',
          contentTitle: 'Integration Test Comment',
          contentPreview: 'This is a test comment for integration testing',
          appealType: 'context_missing',
          appealReason: 'Important context was missing from the review',
          userStatement: 'The full conversation shows this is acceptable',
          submitterId: 'user_2',
          submitterName: 'Integration User 2',
          submittedAt: DateTime(2025, 8, 2, 16, 30),
          expiresAt: DateTime(2025, 8, 9, 16, 30),
          flagReason: 'harassment',
          flagCategories: ['harassment'],
          flagCount: 1,
          votingStatus: VotingStatus.quorumReached,
          urgencyScore: 90,
          estimatedResolution: 'Within 2 hours',
          hasUserVoted: true,
          canUserVote: false,
          userVote: 'approve',
          votingProgress: const VotingProgress(
            totalVotes: 8,
            approveVotes: 6,
            rejectVotes: 2,
            approvalRate: 75.0,
            quorumMet: true,
            timeRemaining: '1 hour',
            estimatedResolution: 'Within 2 hours',
          ),
        ),
      ];
    });

    Widget createTestScreen({MockAppealService? customService}) {
      return MaterialApp(
        home: MockAppealListScreen(service: customService ?? service),
      );
    }

    group('Loading State', () {
      testWidgets('shows loading indicator when data is being fetched', (
        tester,
      ) async {
        // Arrange
        service.setMockAppeals(testAppeals);
        service.setDelay(const Duration(milliseconds: 100));

        // Act
        await tester.pumpWidget(createTestScreen());

        // Assert - Loading state should be visible
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading appeals...'), findsOneWidget);
        expect(find.byType(AppealCard), findsNothing);

        // Wait for loading to complete
        await tester.pumpAndSettle();

        // Assert - Data should be loaded
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(find.text('Loading appeals...'), findsNothing);
        expect(find.byType(AppealCard), findsNWidgets(2));
      });

      testWidgets('transitions from loading to data state correctly', (
        tester,
      ) async {
        // Arrange
        service.setMockAppeals(testAppeals);
        service.setDelay(const Duration(milliseconds: 50));

        // Act
        await tester.pumpWidget(createTestScreen());

        // Assert initial loading state
        expect(find.byType(CircularProgressIndicator), findsOneWidget);

        // Wait for data to load
        await tester.pumpAndSettle();

        // Assert final data state
        expect(find.byType(AppealCard), findsNWidgets(2));
        expect(find.text('Integration Test Post'), findsOneWidget);
        expect(find.text('Integration Test Comment'), findsOneWidget);
      });
    });

    group('Data State', () {
      testWidgets('displays appeal cards correctly when data is loaded', (
        tester,
      ) async {
        // Arrange
        service.setMockAppeals(testAppeals);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(AppealCard), findsNWidgets(2));
        expect(find.byType(ListView), findsOneWidget);

        // Check specific appeal content
        expect(find.text('Integration Test Post'), findsOneWidget);
        expect(
          find.text('This was incorrectly flagged by the system'),
          findsOneWidget,
        );
        expect(find.text('POST'), findsOneWidget);

        // Check voting progress is shown for appeals
        expect(find.text('Community Voting Progress'), findsNWidgets(2));
        expect(find.text('12 votes'), findsOneWidget);
        expect(find.text('8 approve'), findsOneWidget);
        expect(find.text('4 reject'), findsOneWidget);
      });

      testWidgets('handles appeal card interactions correctly', (tester) async {
        // Arrange
        service.setMockAppeals(testAppeals);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Tap on first appeal card
        await tester.tap(find.byType(AppealCard).first);
        await tester.pumpAndSettle();

        // Assert - Snackbar should show
        expect(find.byType(SnackBar), findsOneWidget);
        expect(find.text('Tapped appeal appeal_1'), findsOneWidget);

        // Wait for snackbar to disappear
        await tester.pumpAndSettle(const Duration(seconds: 4));

        // Tap on View Details button
        await tester.tap(find.text('View Details').first);
        await tester.pumpAndSettle();

        // Assert - Different snackbar should show
        expect(find.text('View details for appeal_1'), findsOneWidget);
      });

      testWidgets('supports pull-to-refresh functionality', (tester) async {
        // Arrange
        service.setMockAppeals(testAppeals);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Pull to refresh
        await tester.fling(find.byType(ListView), const Offset(0, 500), 1000);
        await tester.pump();

        // Assert - RefreshIndicator should be active
        expect(find.byType(RefreshIndicator), findsOneWidget);

        // Wait for refresh to complete
        await tester.pumpAndSettle();

        // Data should still be present
        expect(find.byType(AppealCard), findsNWidgets(2));
      });
    });

    group('Error State', () {
      testWidgets('shows error message when data loading fails', (
        tester,
      ) async {
        // Arrange
        service.setShouldReturnError(true);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert
        expect(find.byIcon(Icons.error), findsOneWidget);
        expect(find.text('Error loading appeals'), findsOneWidget);
        expect(find.text('Exception: Network error'), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);
        expect(find.byType(AppealCard), findsNothing);
      });

      testWidgets('allows retry after error state', (tester) async {
        // Arrange
        service.setShouldReturnError(true);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert error state
        expect(find.text('Error loading appeals'), findsOneWidget);

        // Fix the service and retry
        service.setShouldReturnError(false);
        service.setMockAppeals(testAppeals);

        await tester.tap(find.text('Retry'));
        await tester.pumpAndSettle();

        // Assert - Data should now be loaded
        expect(find.byType(AppealCard), findsNWidgets(2));
        expect(find.text('Error loading appeals'), findsNothing);
      });

      testWidgets('can refresh from error state using floating action button', (
        tester,
      ) async {
        // Arrange
        service.setShouldReturnError(true);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert error state
        expect(find.text('Error loading appeals'), findsOneWidget);

        // Fix service and use FAB to refresh
        service.setShouldReturnError(false);
        service.setMockAppeals(testAppeals);

        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();

        // Assert - Data should be loaded
        expect(find.byType(AppealCard), findsNWidgets(2));
      });
    });

    group('Empty State', () {
      testWidgets('shows empty state message when no appeals are available', (
        tester,
      ) async {
        // Arrange
        service.setShouldReturnEmpty(true);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert
        expect(find.byIcon(Icons.inbox), findsOneWidget);
        expect(find.text('No appeals found'), findsOneWidget);
        expect(
          find.text('There are no appeals to review at the moment.'),
          findsOneWidget,
        );
        expect(find.byType(AppealCard), findsNothing);
      });

      testWidgets('can refresh from empty state', (tester) async {
        // Arrange
        service.setShouldReturnEmpty(true);

        // Act
        await tester.pumpWidget(createTestScreen());
        await tester.pumpAndSettle();

        // Assert empty state
        expect(find.text('No appeals found'), findsOneWidget);

        // Add data and refresh
        service.setShouldReturnEmpty(false);
        service.setMockAppeals(testAppeals);

        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();

        // Assert - Data should be loaded
        expect(find.byType(AppealCard), findsNWidgets(2));
        expect(find.text('No appeals found'), findsNothing);
      });
    });

    group('State Transitions', () {
      testWidgets(
        'correctly handles loading -> data -> loading -> error transition',
        (tester) async {
          // Arrange - Start with successful data
          service.setMockAppeals(testAppeals);

          // Act - Initial load
          await tester.pumpWidget(createTestScreen());
          await tester.pumpAndSettle();

          // Assert - Data state
          expect(find.byType(AppealCard), findsNWidgets(2));

          // Change to error state and refresh
          service.setShouldReturnError(true);
          await tester.tap(find.byType(FloatingActionButton));

          // Wait for loading state
          await tester.pump();
          expect(find.byType(CircularProgressIndicator), findsOneWidget);

          // Wait for error state
          await tester.pumpAndSettle();
          expect(find.text('Error loading appeals'), findsOneWidget);
          expect(find.byType(AppealCard), findsNothing);
        },
      );

      testWidgets('handles rapid state changes correctly', (tester) async {
        // Arrange
        service.setMockAppeals(testAppeals);
        service.setDelay(const Duration(milliseconds: 100));

        // Act
        await tester.pumpWidget(createTestScreen());

        // Trigger multiple rapid refreshes
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pump(const Duration(milliseconds: 50));
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pump(const Duration(milliseconds: 50));
        await tester.tap(find.byType(FloatingActionButton));

        // Wait for all operations to complete
        await tester.pumpAndSettle();

        // Assert - Should end up in data state
        expect(find.byType(AppealCard), findsNWidgets(2));
        expect(find.byType(CircularProgressIndicator), findsNothing);
      });
    });
  });
}

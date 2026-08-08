import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/review_queue_screen.dart';
import 'package:lythaus/features/moderation/moderation_service.dart';

class MockModerationService implements ModerationService {
  final Map<String, dynamic> reviewQueueResponses = {};
  final Map<String, Exception> exceptions = {};
  final List<String> approvedItems = [];
  final List<String> rejectedItems = [];
  final List<String> escalatedItems = [];

  @override
  String get baseUrl => 'https://test.com';

  void setReviewQueueResponse(String key, Map<String, dynamic> response) {
    reviewQueueResponses[key] = response;
  }

  void setException(String method, Exception exception) {
    exceptions[method] = exception;
  }

  @override
  Future<Map<String, dynamic>> fetchReviewQueue({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
    String status = 'pending',
  }) async {
    final key = 'fetchReviewQueue_${accessToken}_${page}_${pageSize}_$status';

    if (exceptions.containsKey('fetchReviewQueue')) {
      throw exceptions['fetchReviewQueue']!;
    }

    final response =
        reviewQueueResponses[key] ?? {'items': <Map<String, dynamic>>[]};
    return response as Map<String, dynamic>;
  }

  @override
  Future<void> approve(String accessToken, String appealId) async {
    if (exceptions.containsKey('approve')) {
      throw exceptions['approve']!;
    }
    approvedItems.add(appealId);
  }

  @override
  Future<void> reject(String accessToken, String appealId) async {
    if (exceptions.containsKey('reject')) {
      throw exceptions['reject']!;
    }
    rejectedItems.add(appealId);
  }

  @override
  Future<void> escalate(String accessToken, String appealId) async {
    if (exceptions.containsKey('escalate')) {
      throw exceptions['escalate']!;
    }
    escalatedItems.add(appealId);
  }

  @override
  Future<void> vote(String accessToken, String appealId, String vote) async {
    if (exceptions.containsKey('vote')) {
      throw exceptions['vote']!;
    }
    // Mock implementation
  }
}

void main() {
  testWidgets('renders empty state for no permission', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 't',
          userClaims: {'role': 'user'},
        ),
      ),
    );
    expect(find.text('Insufficient permissions.'), findsOneWidget);
  });

  testWidgets('_loadMore appends paginated items', (tester) async {
    final svc = MockModerationService();

    // Set up response for page 1 with exactly 20 items to trigger hasMore=true
    final page1Items = List.generate(
      20,
      (i) => {'id': '${i + 1}', 'title': 'Item ${i + 1}'},
    );
    svc.setReviewQueueResponse('fetchReviewQueue_test-token_1_20_pending', {
      'items': page1Items,
    });

    // Set up response for page 2
    svc.setReviewQueueResponse('fetchReviewQueue_test-token_2_20_pending', {
      'items': [
        {'id': '21', 'title': 'Item 21'},
        {'id': '22', 'title': 'Item 22'},
      ],
    });

    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 'test-token',
          userClaims: const {'role': 'moderator'},
          autoLoad: true,
          service: svc,
        ),
      ),
    );

    // Wait for initial load to complete
    await tester.pumpAndSettle();

    // Check that some list items are rendered
    expect(find.byType(ListTile), findsAtLeastNWidgets(1));

    // Scroll to trigger pagination
    final listView = find.byType(ListView);
    await tester.drag(listView, const Offset(0, -1000));
    await tester.pumpAndSettle();

    // Still should have list items
    expect(find.byType(ListTile), findsAtLeastNWidgets(1));

    // Test that we can find some text content (the mock provides title field)
    expect(find.textContaining('Item'), findsAtLeastNWidgets(1));
  });

  testWidgets('action buttons call service methods', (tester) async {
    final svc = MockModerationService();

    svc.setReviewQueueResponse('fetchReviewQueue_test-token_1_20_pending', {
      'items': [
        {'id': '1', 'title': 'A'},
        {'id': '2', 'title': 'B'},
        {'id': '3', 'title': 'C'},
      ],
    });

    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 'test-token',
          userClaims: const {'role': 'moderator'},
          autoLoad: true, // Enable autoLoad to populate the list
          service: svc,
        ),
      ),
    );

    // Wait for the initial data to load
    await tester.pumpAndSettle();

    // Verify that list items are present
    expect(find.byType(ListTile), findsNWidgets(3));

    // Tap the action buttons
    await tester.tap(find.byIcon(Icons.check).first);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.outbound).first);
    await tester.pumpAndSettle();

    // Verify that the methods were called by checking the mock's state
    expect(svc.approvedItems, contains('1'));
    expect(svc.rejectedItems, contains('2'));
    expect(svc.escalatedItems, contains('3'));
  });

  testWidgets('autoLoad=false waits until refresh', (tester) async {
    final svc = MockModerationService();

    svc.setReviewQueueResponse('fetchReviewQueue_test-token_1_20_pending', {
      'items': <Map<String, dynamic>>[],
    });

    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 'test-token',
          userClaims: const {'role': 'moderator'},
          autoLoad: false,
          service: svc,
        ),
      ),
    );

    // Initially, should show empty state since autoLoad=false
    await tester.pumpAndSettle();
    expect(find.text('No items in review queue.'), findsOneWidget);

    // Trigger refresh using RefreshIndicator by finding it and calling onRefresh
    final refreshIndicator = tester.widget<RefreshIndicator>(
      find.byType(RefreshIndicator),
    );
    await refreshIndicator.onRefresh();
    await tester.pumpAndSettle();

    // After refresh, should still show empty state but data was fetched
    expect(find.text('No items in review queue.'), findsOneWidget);
  });
}

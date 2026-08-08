import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/review_queue_screen.dart';
import 'package:lythaus/features/moderation/moderation_service.dart';

class _FakeModerationService extends ModerationService {
  _FakeModerationService() : super('https://example.com');

  int approveCount = 0;
  int rejectCount = 0;
  int escalateCount = 0;
  String? lastStatus;

  @override
  Future<Map<String, dynamic>> fetchReviewQueue({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
    String status = 'pending',
  }) async {
    lastStatus = status;
    return {
      'items': [
        {'id': '1', 'title': 'First', 'reason': 'spam'},
        {'id': '2', 'title': 'Second', 'reason': 'harmful'},
      ],
    };
  }

  @override
  Future<void> approve(String accessToken, String appealId) async {
    approveCount++;
  }

  @override
  Future<void> reject(String accessToken, String appealId) async {
    rejectCount++;
  }

  @override
  Future<void> escalate(String accessToken, String appealId) async {
    escalateCount++;
  }
}

void main() {
  testWidgets('loads items for authorized user and executes actions', (
    tester,
  ) async {
    final fake = _FakeModerationService();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 't',
          userClaims: const {'role': 'moderator'},
          service: fake,
        ),
      ),
    );

    // Initial pump then settle after async fetch
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    expect(find.text('First'), findsOneWidget);
    expect(find.text('Second'), findsOneWidget);

    // Tap approve on first item
    final approveButton = find.byIcon(Icons.check).first;
    await tester.tap(approveButton);
    await tester.pump();
    expect(fake.approveCount, 1);
  });

  testWidgets('status dropdown triggers refresh with new status', (
    tester,
  ) async {
    final fake = _FakeModerationService();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 't',
          userClaims: const {'role': 'moderator'},
          service: fake,
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(fake.lastStatus, anyOf(null, 'pending'));

    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Escalated').last);
    await tester.pumpAndSettle();

    // After change, the service should have been called with 'escalated'
    expect(fake.lastStatus, equals('escalated'));
  });

  testWidgets('shows empty state when no items', (tester) async {
    // Fake service that returns empty list
    final empty = _FakeModerationServiceEmpty();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewQueueScreen(
          baseUrl: 'https://example.com',
          accessToken: 't',
          userClaims: const {'role': 'moderator'},
          service: empty,
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('No items in review queue.'), findsOneWidget);
  });
}

class _FakeModerationServiceEmpty extends ModerationService {
  _FakeModerationServiceEmpty() : super('https://example.com');
  @override
  Future<Map<String, dynamic>> fetchReviewQueue({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
    String status = 'pending',
  }) async => {'items': <Map<String, dynamic>>[]};
}

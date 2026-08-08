import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/review_queue_screen.dart';
import 'package:lythaus/features/moderation/moderation_service.dart';

/// A fake ModerationService that returns scripted results.
class _FakeModerationService extends ModerationService {
  _FakeModerationService() : super('http://test');

  List<Map<String, dynamic>> items = [];
  int fetchCount = 0;
  final List<String> approvedIds = [];
  final List<String> rejectedIds = [];
  final List<String> escalatedIds = [];
  bool shouldThrow = false;

  @override
  Future<Map<String, dynamic>> fetchReviewQueue({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
    String status = 'pending',
  }) async {
    fetchCount++;
    if (shouldThrow) throw Exception('network error');
    return {'items': items};
  }

  @override
  Future<void> approve(String accessToken, String id) async {
    if (shouldThrow) throw Exception('fail');
    approvedIds.add(id);
  }

  @override
  Future<void> reject(String accessToken, String id) async {
    if (shouldThrow) throw Exception('fail');
    rejectedIds.add(id);
  }

  @override
  Future<void> escalate(String accessToken, String id) async {
    if (shouldThrow) throw Exception('fail');
    escalatedIds.add(id);
  }
}

Widget _buildScreen({
  required _FakeModerationService service,
  Map<String, dynamic>? claims,
  bool autoLoad = true,
}) {
  return MaterialApp(
    home: ReviewQueueScreen(
      baseUrl: 'http://test',
      accessToken: 'tok',
      userClaims: claims ?? {'role': 'admin'},
      autoLoad: autoLoad,
      service: service,
    ),
  );
}

void main() {
  late _FakeModerationService service;

  setUp(() {
    service = _FakeModerationService();
  });

  testWidgets('shows "Insufficient permissions" for non-admin', (tester) async {
    await tester.pumpWidget(
      _buildScreen(
        service: service,
        claims: {'role': 'viewer'},
        autoLoad: false,
      ),
    );
    await tester.pump();
    expect(find.text('Insufficient permissions.'), findsOneWidget);
  });

  testWidgets('shows ListEmptyState when no items', (tester) async {
    service.items = [];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();
    expect(find.text('No items in review queue.'), findsOneWidget);
  });

  testWidgets('displays items from service', (tester) async {
    service.items = [
      {'id': 'a1', 'title': 'Post A', 'reason': 'spam'},
      {'id': 'a2', 'title': 'Post B', 'status': 'pending'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    expect(find.text('Post A'), findsOneWidget);
    expect(find.text('spam'), findsOneWidget);
    expect(find.text('Post B'), findsOneWidget);
    expect(find.text('pending'), findsOneWidget);
  });

  testWidgets('approve action calls service and removes item', (tester) async {
    service.items = [
      {'id': 'a1', 'title': 'Post A', 'reason': 'spam'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    // Tap check icon to approve
    await tester.tap(find.byIcon(Icons.check).first);
    await tester.pumpAndSettle();

    expect(service.approvedIds, contains('a1'));
  });

  testWidgets('reject action calls service', (tester) async {
    service.items = [
      {'id': 'r1', 'title': 'Bad Post', 'reason': 'hate'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();

    expect(service.rejectedIds, contains('r1'));
  });

  testWidgets('escalate action calls service', (tester) async {
    service.items = [
      {'id': 'e1', 'title': 'Escalate Me', 'reason': 'threats'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.outbound).first);
    await tester.pumpAndSettle();

    expect(service.escalatedIds, contains('e1'));
  });

  testWidgets('tapping item opens detail dialog', (tester) async {
    service.items = [
      {'id': 'd1', 'title': 'Detail Item', 'reason': 'test'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Detail Item'));
    await tester.pumpAndSettle();

    // Dialog should show the JSON detail
    expect(find.text('Detail Item'), findsAtLeastNWidgets(1));
    expect(find.text('Close'), findsOneWidget);

    // Dismiss dialog
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
  });

  testWidgets('dropdown changes status filter and re-fetches', (tester) async {
    service.items = [];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();
    final initialCount = service.fetchCount;

    // Open dropdown and select 'Escalated'
    await tester.tap(find.text('Pending'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Escalated').last);
    await tester.pumpAndSettle();

    expect(service.fetchCount, greaterThan(initialCount));
  });

  testWidgets('uses appealId when id is absent', (tester) async {
    service.items = [
      {'appealId': 'ap1', 'contentId': 'C100', 'status': 'pending'},
    ];
    await tester.pumpWidget(_buildScreen(service: service));
    await tester.pumpAndSettle();

    // Title should show contentId when no title
    expect(find.text('C100'), findsOneWidget);

    // Approve should use appealId
    await tester.tap(find.byIcon(Icons.check).first);
    await tester.pumpAndSettle();
    expect(service.approvedIds, contains('ap1'));
  });
}

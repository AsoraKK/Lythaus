/// Widget tests for PostInsightsPanel
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/feed/presentation/post_insights_panel.dart';
import 'package:lythaus/features/feed/application/post_insights_providers.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

void main() {
  group('PostInsightsPanel', () {
    testWidgets('shows insights panel when data is available', (
      WidgetTester tester,
    ) async {
      final mockInsights = PostInsights(
        postId: 'post-123',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: ['AUTHENTICITY_SCORE_UNDER_THRESHOLD'],
        configVersion: 5,
        decidedAt: DateTime(2025, 12, 28, 10, 0),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsSuccess(mockInsights)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      // Wait for async data to load
      await tester.pumpAndSettle();

      // Verify panel is visible
      expect(find.text('Insights'), findsOneWidget);
      expect(find.text('Low'), findsOneWidget);
      expect(find.text('Config v5'), findsOneWidget);
      expect(find.text('Appeal: None'), findsOneWidget);
    });

    testWidgets('shows HIGH risk band with correct styling', (
      WidgetTester tester,
    ) async {
      final mockInsights = PostInsights(
        postId: 'post-123',
        riskBand: RiskBand.high,
        decision: InsightDecision.block,
        reasonCodes: ['AUTHENTICITY_SCORE_OVER_THRESHOLD'],
        configVersion: 10,
        decidedAt: DateTime(2025, 12, 28, 10, 0),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsSuccess(mockInsights)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('High'), findsOneWidget);
      expect(find.text('Config v10'), findsOneWidget);
    });

    testWidgets('shows MEDIUM risk band (under review) correctly', (
      WidgetTester tester,
    ) async {
      final mockInsights = PostInsights(
        postId: 'post-123',
        riskBand: RiskBand.medium,
        decision:
            InsightDecision.block, // Binary: BLOCK with pending appeal = MEDIUM
        reasonCodes: ['AUTHENTICITY_SCORE_OVER_FLAG_THRESHOLD'],
        configVersion: 7,
        decidedAt: DateTime(2025, 12, 28, 10, 0),
        appeal: const InsightAppeal(status: InsightAppealStatus.pending),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsSuccess(mockInsights)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(
        find.text('Appeal pending'),
        findsOneWidget,
      ); // MEDIUM = appeal pending
      expect(find.text('Appeal: Pending'), findsOneWidget);
    });

    testWidgets('renders nothing when access is denied (403)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider(
              'post-123',
            ).overrideWith((ref) => Future.value(InsightsAccessDenied())),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Panel should not be visible
      expect(find.text('Insights'), findsNothing);
      expect(find.byType(Card), findsNothing);
    });

    testWidgets('renders nothing when post not found (404)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider(
              'post-123',
            ).overrideWith((ref) => Future.value(InsightsNotFound())),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Panel should not be visible
      expect(find.text('Insights'), findsNothing);
      expect(find.byType(Card), findsNothing);
    });

    testWidgets('renders nothing on error', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsError('Network error')),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Panel should not be visible
      expect(find.text('Insights'), findsNothing);
    });

    testWidgets('shows loading skeleton while fetching', (
      WidgetTester tester,
    ) async {
      // Use a completer that never completes to simulate loading state
      final completer = Completer<InsightsResult>();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider(
              'post-123',
            ).overrideWith((ref) => completer.future),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      // Don't wait for settle - check while loading
      await tester.pump();

      // Should show loading skeleton
      expect(find.text('Insights'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);

      // Complete the future to allow test cleanup
      completer.complete(InsightsAccessDenied());
      await tester.pumpAndSettle();
    });

    testWidgets('shows appeal status OVERTURN correctly', (
      WidgetTester tester,
    ) async {
      final mockInsights = PostInsights(
        postId: 'post-123',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime(2025, 12, 28, 10, 0),
        appeal: InsightAppeal(
          status: InsightAppealStatus.overturned,
          updatedAt: DateTime(2025, 12, 28, 11, 30),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsSuccess(mockInsights)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Appeal: Restored'), findsOneWidget);
      // Check icon is present
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('shows appeal status UPHOLD correctly', (
      WidgetTester tester,
    ) async {
      final mockInsights = PostInsights(
        postId: 'post-123',
        riskBand: RiskBand.high, // BLOCK + upheld appeal = HIGH
        decision: InsightDecision.block,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime(2025, 12, 28, 10, 0),
        appeal: const InsightAppeal(status: InsightAppealStatus.upheld),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            postInsightsProvider('post-123').overrideWith(
              (ref) => Future.value(InsightsSuccess(mockInsights)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: PostInsightsPanel(postId: 'post-123')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Appeal: Upheld'), findsOneWidget);
      expect(find.byIcon(Icons.cancel), findsOneWidget);
    });
  });
}

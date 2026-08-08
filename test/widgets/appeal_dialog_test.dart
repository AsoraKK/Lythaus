import 'package:dio/dio.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/widgets/appeal_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockModerationRepository extends Mock implements ModerationRepository {}

Appeal _buildAppeal({String appealId = 'appeal-1'}) {
  return Appeal(
    appealId: appealId,
    contentId: 'post-123',
    contentType: 'post',
    contentPreview: 'Preview',
    appealType: 'false_positive',
    appealReason: 'Reason',
    userStatement: 'Statement',
    submitterId: 'user-123',
    submitterName: 'User',
    submittedAt: DateTime.utc(2025, 1, 1),
    expiresAt: DateTime.utc(2025, 1, 2),
    flagReason: 'flag',
    flagCategories: const ['spam'],
    flagCount: 1,
    votingStatus: VotingStatus.active,
    urgencyScore: 10,
    estimatedResolution: 'Soon',
    hasUserVoted: false,
    canUserVote: false,
  );
}

void main() {
  late MockModerationRepository mockRepository;

  setUp(() {
    mockRepository = MockModerationRepository();
  });

  testWidgets(
    'shows daily appeal limit message when the API rejects the request',
    (tester) async {
      const error = ModerationException(
        'You have reached your daily appeals limit. Please try again tomorrow.',
        code: 'DAILY_APPEAL_LIMIT_EXCEEDED',
        statusCode: 429,
        payload: {
          'code': 'DAILY_APPEAL_LIMIT_EXCEEDED',
          'tier': 'free',
          'limit': 1,
          'resetAt': '2025-01-01T12:00:00.000Z',
        },
      );

      when(
        () => mockRepository.submitAppeal(
          contentId: any(named: 'contentId'),
          contentType: any(named: 'contentType'),
          appealType: any(named: 'appealType'),
          appealReason: any(named: 'appealReason'),
          userStatement: any(named: 'userStatement'),
          token: any(named: 'token'),
        ),
      ).thenThrow(error);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            moderationClientProvider.overrideWithValue(mockRepository),
            jwtProvider.overrideWith((_) async => 'jwt-token'),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: AppealDialog(
                contentId: 'post-123',
                contentType: 'post',
                currentStatus: ModerationStatus.hidden,
              ),
            ),
          ),
        ),
      );

      await tester.enterText(
        find.byType(TextField).at(0),
        'Valid reason that exceeds ten characters',
      );
      await tester.enterText(
        find.byType(TextField).at(1),
        'Detailed statement that contains more than fifty characters for validation.',
      );
      await tester.pump();

      await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('daily appeals limit', findRichText: false),
        findsOneWidget,
      );
    },
  );

  testWidgets('shows community approval copy and content preview', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-789',
              contentType: 'post',
              currentStatus: ModerationStatus.communityRejected,
              contentPreview: 'Sample preview text',
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is RichText &&
            widget.text.toPlainText().contains(
              'This content was rejected by community vote',
            ),
      ),
      findsOneWidget,
    );
    expect(find.text('Content Preview:'), findsOneWidget);
    expect(find.text('Sample preview text'), findsOneWidget);
  });

  testWidgets('validates reason and statement fields before submission', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-101',
              contentType: 'post',
              currentStatus: ModerationStatus.flagged,
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(find.text('Please provide a reason for your appeal'), findsWidgets);
    expect(find.text('Please provide a detailed statement'), findsWidgets);

    await tester.enterText(find.byType(TextField).at(0), 'short');
    await tester.enterText(
      find.byType(TextField).at(1),
      'Brief statement that is not long enough',
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(
      find.text('Appeal reason must be at least 10 characters'),
      findsWidgets,
    );
    expect(find.text('Statement must be at least 50 characters'), findsWidgets);
  });

  testWidgets('submits appeal and shows success feedback', (tester) async {
    when(
      () => mockRepository.submitAppeal(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        appealType: any(named: 'appealType'),
        appealReason: any(named: 'appealReason'),
        userStatement: any(named: 'userStatement'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildAppeal());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  showAppealDialog(
                    context: context,
                    contentId: 'post-123',
                    contentType: 'post',
                    currentStatus: ModerationStatus.hidden,
                  );
                });
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).at(0),
      'Valid reason that exceeds ten characters',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Detailed statement that contains more than fifty characters for validation.',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Appeal submitted successfully'),
      findsOneWidget,
    );
  });

  testWidgets('shows login prompt on 401 response', (tester) async {
    final requestOptions = RequestOptions(path: '/api/appealContent');
    final response = Response<void>(
      requestOptions: requestOptions,
      statusCode: 401,
    );
    final error = DioException(
      requestOptions: requestOptions,
      response: response,
    );

    when(
      () => mockRepository.submitAppeal(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        appealType: any(named: 'appealType'),
        appealReason: any(named: 'appealReason'),
        userStatement: any(named: 'userStatement'),
        token: any(named: 'token'),
      ),
    ).thenThrow(error);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-401',
              contentType: 'post',
              currentStatus: ModerationStatus.hidden,
            ),
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byType(TextField).at(0),
      'Valid reason that exceeds ten characters',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Detailed statement that contains more than fifty characters for validation.',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(find.text('Please log in to submit an appeal'), findsOneWidget);
  });

  testWidgets('shows conflict message on duplicate appeal', (tester) async {
    final requestOptions = RequestOptions(path: '/api/appealContent');
    final response = Response<void>(
      requestOptions: requestOptions,
      statusCode: 409,
    );
    final error = DioException(
      requestOptions: requestOptions,
      response: response,
    );

    when(
      () => mockRepository.submitAppeal(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        appealType: any(named: 'appealType'),
        appealReason: any(named: 'appealReason'),
        userStatement: any(named: 'userStatement'),
        token: any(named: 'token'),
      ),
    ).thenThrow(error);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-409',
              contentType: 'post',
              currentStatus: ModerationStatus.hidden,
            ),
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byType(TextField).at(0),
      'Valid reason that exceeds ten characters',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Detailed statement that contains more than fifty characters for validation.',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(
      find.text('You have already submitted an appeal for this content'),
      findsOneWidget,
    );
  });

  testWidgets('shows API error message when provided', (tester) async {
    final requestOptions = RequestOptions(path: '/api/appealContent');
    final response = Response<Map<String, dynamic>>(
      requestOptions: requestOptions,
      statusCode: 400,
      data: {'error': 'Invalid request'},
    );
    final error = DioException(
      requestOptions: requestOptions,
      response: response,
    );

    when(
      () => mockRepository.submitAppeal(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        appealType: any(named: 'appealType'),
        appealReason: any(named: 'appealReason'),
        userStatement: any(named: 'userStatement'),
        token: any(named: 'token'),
      ),
    ).thenThrow(error);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => 'jwt-token'),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-400',
              contentType: 'post',
              currentStatus: ModerationStatus.hidden,
            ),
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byType(TextField).at(0),
      'Valid reason that exceeds ten characters',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Detailed statement that contains more than fifty characters for validation.',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid request'), findsOneWidget);
  });

  testWidgets('shows authentication error when token missing', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationClientProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((_) async => null),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AppealDialog(
              contentId: 'post-000',
              contentType: 'post',
              currentStatus: ModerationStatus.hidden,
            ),
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byType(TextField).at(0),
      'Valid reason that exceeds ten characters',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'Detailed statement that contains more than fifty characters for validation.',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Submit Appeal'));
    await tester.pumpAndSettle();

    expect(find.text('User not authenticated'), findsOneWidget);
  });
}

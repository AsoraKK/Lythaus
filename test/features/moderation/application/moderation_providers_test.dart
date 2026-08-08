import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

void main() {
  late ProviderContainer container;
  late _MockModerationRepository mockRepository;

  // Test data
  final testAppeal = Appeal(
    appealId: 'appeal-123',
    contentId: 'content-123',
    contentType: 'post',
    contentTitle: 'Test Content',
    contentPreview: 'Test preview',
    appealType: 'false_positive',
    appealReason: 'Not spam',
    userStatement: 'This content was flagged incorrectly',
    submitterId: 'user-123',
    submitterName: 'Test User',
    submittedAt: DateTime.utc(2024, 1, 1),
    expiresAt: DateTime.utc(2024, 1, 8),
    flagReason: 'spam',
    authorshipLabel: 'Under review',
    classificationSource: 'automated_classification',
    flagCategories: ['spam'],
    flagCount: 1,
    votingStatus: VotingStatus.active,
    votingProgress: const VotingProgress(
      totalVotes: 10,
      approveVotes: 7,
      rejectVotes: 3,
      approvalRate: 0.7,
      quorumMet: false,
      timeRemaining: '7 days',
      estimatedResolution: '2024-01-08T00:00:00Z',
    ),
    urgencyScore: 5,
    estimatedResolution: '2024-01-08T00:00:00Z',
    hasUserVoted: false,
    canUserVote: true,
  );

  final testAppealResponse = AppealResponse(
    appeals: [testAppeal],
    pagination: const AppealPagination(
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
      totalPages: 1,
    ),
    filters: const AppealFilters(),
    summary: const AppealSummary(
      totalActive: 1,
      totalVotes: 10,
      userVotes: 0,
      averageResolutionTime: 7.0,
      categoryBreakdown: {'spam': 1},
    ),
  );

  const testVoteResult = VoteResult(
    success: true,
    message: 'Vote recorded successfully',
    tallyTriggered: false,
    updatedProgress: VotingProgress(
      totalVotes: 11,
      approveVotes: 8,
      rejectVotes: 3,
      approvalRate: 0.73,
      quorumMet: false,
      timeRemaining: '6 days',
      estimatedResolution: '2024-01-07T00:00:00Z',
    ),
  );

  setUp(() {
    mockRepository = _MockModerationRepository();
    container = ProviderContainer(
      overrides: [
        moderationRepositoryProvider.overrideWithValue(mockRepository),
        jwtProvider.overrideWith((ref) => Future.value('mock-jwt-token')),
      ],
    );
  });

  tearDown(() {
    container.dispose();
  });

  group('moderationClientProvider', () {
    test('returns moderation repository', () {
      final repository = container.read(moderationClientProvider);
      expect(repository, isA<ModerationRepository>());
    });
  });

  group('myAppealsProvider', () {
    test('successfully fetches user appeals', () async {
      when(
        () => mockRepository.getMyAppeals(token: 'mock-jwt-token'),
      ).thenAnswer((_) async => [testAppeal]);

      final result = await container.read(myAppealsProvider.future);
      expect(result, [testAppeal]);
      verify(
        () => mockRepository.getMyAppeals(token: 'mock-jwt-token'),
      ).called(1);
    });

    test('throws ModerationException when not authenticated', () async {
      container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((ref) => Future.value(null)),
        ],
      );

      expect(
        () => container.read(myAppealsProvider.future),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws ModerationException when token is empty', () async {
      container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(mockRepository),
          jwtProvider.overrideWith((ref) => Future.value('')),
        ],
      );

      expect(
        () => container.read(myAppealsProvider.future),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  group('votingFeedProvider', () {
    test('successfully fetches voting feed with default params', () async {
      when(
        () => mockRepository.getVotingFeed(
          page: 1,
          pageSize: 20,
          filters: null,
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => testAppealResponse);

      final result = await container.read(
        votingFeedProvider(const VotingFeedParams()).future,
      );
      expect(result, testAppealResponse);
      verify(
        () => mockRepository.getVotingFeed(
          page: 1,
          pageSize: 20,
          filters: null,
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });

    test('successfully fetches voting feed with custom params', () async {
      const params = VotingFeedParams(
        page: 2,
        pageSize: 10,
        filters: AppealFilters(contentType: 'post'),
      );

      when(
        () => mockRepository.getVotingFeed(
          page: 2,
          pageSize: 10,
          filters: params.filters,
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => testAppealResponse);

      final result = await container.read(votingFeedProvider(params).future);
      expect(result, testAppealResponse);
      verify(
        () => mockRepository.getVotingFeed(
          page: 2,
          pageSize: 10,
          filters: params.filters,
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });
  });

  group('submitVoteProvider', () {
    test('successfully submits vote', () async {
      const submission = VoteSubmission(
        appealId: 'appeal-123',
        vote: 'approve',
        comment: 'Looks good to me',
      );

      when(
        () => mockRepository.submitVote(
          appealId: 'appeal-123',
          vote: 'approve',
          comment: 'Looks good to me',
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => testVoteResult);

      final result = await container.read(
        submitVoteProvider(submission).future,
      );
      expect(result, testVoteResult);
      verify(
        () => mockRepository.submitVote(
          appealId: 'appeal-123',
          vote: 'approve',
          comment: 'Looks good to me',
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });

    test('successfully submits vote without comment', () async {
      const submission = VoteSubmission(appealId: 'appeal-123', vote: 'reject');

      when(
        () => mockRepository.submitVote(
          appealId: 'appeal-123',
          vote: 'reject',
          comment: null,
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => testVoteResult);

      final result = await container.read(
        submitVoteProvider(submission).future,
      );
      expect(result, testVoteResult);
      verify(
        () => mockRepository.submitVote(
          appealId: 'appeal-123',
          vote: 'reject',
          comment: null,
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });
  });

  group('submitAppealProvider', () {
    test('successfully submits appeal', () async {
      const submission = AppealSubmission(
        contentId: 'content-123',
        contentType: 'post',
        appealType: 'false_positive',
        appealReason: 'Not spam',
        userStatement: 'This was flagged incorrectly',
      );

      when(
        () => mockRepository.submitAppeal(
          contentId: 'content-123',
          contentType: 'post',
          appealType: 'false_positive',
          appealReason: 'Not spam',
          userStatement: 'This was flagged incorrectly',
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => testAppeal);

      final result = await container.read(
        submitAppealProvider(submission).future,
      );
      expect(result, testAppeal);
      verify(
        () => mockRepository.submitAppeal(
          contentId: 'content-123',
          contentType: 'post',
          appealType: 'false_positive',
          appealReason: 'Not spam',
          userStatement: 'This was flagged incorrectly',
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });
  });

  group('flagContentProvider', () {
    test('successfully flags content with details', () async {
      const submission = FlagSubmission(
        contentId: 'content-123',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: 'Contains promotional links',
      );

      const expectedResult = {'success': true, 'flagId': 'flag-123'};

      when(
        () => mockRepository.flagContent(
          contentId: 'content-123',
          contentType: 'post',
          reason: 'spam',
          additionalDetails: 'Contains promotional links',
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => expectedResult);

      final result = await container.read(
        flagContentProvider(submission).future,
      );
      expect(result, expectedResult);
      verify(
        () => mockRepository.flagContent(
          contentId: 'content-123',
          contentType: 'post',
          reason: 'spam',
          additionalDetails: 'Contains promotional links',
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });

    test('successfully flags content without additional details', () async {
      const submission = FlagSubmission(
        contentId: 'content-123',
        contentType: 'post',
        reason: 'inappropriate',
      );

      const expectedResult = {'success': true, 'flagId': 'flag-124'};

      when(
        () => mockRepository.flagContent(
          contentId: 'content-123',
          contentType: 'post',
          reason: 'inappropriate',
          additionalDetails: null,
          token: 'mock-jwt-token',
        ),
      ).thenAnswer((_) async => expectedResult);

      final result = await container.read(
        flagContentProvider(submission).future,
      );
      expect(result, expectedResult);
      verify(
        () => mockRepository.flagContent(
          contentId: 'content-123',
          contentType: 'post',
          reason: 'inappropriate',
          additionalDetails: null,
          token: 'mock-jwt-token',
        ),
      ).called(1);
    });
  });

  group('VotingFeedParams', () {
    test('creates with default values', () {
      const params = VotingFeedParams();
      expect(params.page, 1);
      expect(params.pageSize, 20);
      expect(params.filters, isNull);
    });

    test('creates with custom values', () {
      const filters = AppealFilters(contentType: 'post');
      const params = VotingFeedParams(page: 2, pageSize: 10, filters: filters);
      expect(params.page, 2);
      expect(params.pageSize, 10);
      expect(params.filters, filters);
    });
  });

  group('VoteSubmission', () {
    test('creates with required fields', () {
      const submission = VoteSubmission(
        appealId: 'appeal-123',
        vote: 'approve',
      );
      expect(submission.appealId, 'appeal-123');
      expect(submission.vote, 'approve');
      expect(submission.comment, isNull);
    });

    test('creates with optional comment', () {
      const submission = VoteSubmission(
        appealId: 'appeal-123',
        vote: 'reject',
        comment: 'Not appropriate',
      );
      expect(submission.appealId, 'appeal-123');
      expect(submission.vote, 'reject');
      expect(submission.comment, 'Not appropriate');
    });
  });

  group('AppealSubmission', () {
    test('creates with all required fields', () {
      const submission = AppealSubmission(
        contentId: 'content-123',
        contentType: 'post',
        appealType: 'false_positive',
        appealReason: 'Not spam',
        userStatement: 'Flagged incorrectly',
      );
      expect(submission.contentId, 'content-123');
      expect(submission.contentType, 'post');
      expect(submission.appealType, 'false_positive');
      expect(submission.appealReason, 'Not spam');
      expect(submission.userStatement, 'Flagged incorrectly');
    });
  });

  group('FlagSubmission', () {
    test('creates with required fields', () {
      const submission = FlagSubmission(
        contentId: 'content-123',
        contentType: 'post',
        reason: 'spam',
      );
      expect(submission.contentId, 'content-123');
      expect(submission.contentType, 'post');
      expect(submission.reason, 'spam');
      expect(submission.additionalDetails, isNull);
    });

    test('creates with optional details', () {
      const submission = FlagSubmission(
        contentId: 'content-123',
        contentType: 'post',
        reason: 'inappropriate',
        additionalDetails: 'Contains hate speech',
      );
      expect(submission.contentId, 'content-123');
      expect(submission.contentType, 'post');
      expect(submission.reason, 'inappropriate');
      expect(submission.additionalDetails, 'Contains hate speech');
    });
  });
}

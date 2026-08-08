import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';

/// Coverage tests for data class constructors in moderation_providers.dart
/// Targets uncovered lines: 140 (VotingFeedParams), 162 (AppealSubmission),
/// 177 (FlagSubmission).
void main() {
  test('VotingFeedParams default constructor', () {
    // Use non-const invocation to ensure runtime execution for coverage
    const params = VotingFeedParams();
    expect(params.page, 1);
    expect(params.pageSize, 20);
    expect(params.filters, isNull);
  });

  test('VotingFeedParams with custom values', () {
    const params = VotingFeedParams(page: 3, pageSize: 50);
    expect(params.page, 3);
    expect(params.pageSize, 50);
  });

  test('AppealSubmission constructor', () {
    const submission = AppealSubmission(
      contentId: 'c1',
      contentType: 'post',
      appealType: 'disagree',
      appealReason: 'wrongful removal',
      userStatement: 'I believe this was a mistake',
    );
    expect(submission.contentId, 'c1');
    expect(submission.appealType, 'disagree');
    expect(submission.contentType, 'post');
    expect(submission.appealReason, 'wrongful removal');
    expect(submission.userStatement, 'I believe this was a mistake');
  });

  test('FlagSubmission constructor', () {
    const flag = FlagSubmission(
      contentId: 'c2',
      contentType: 'comment',
      reason: 'spam',
      additionalDetails: 'repeated ads',
    );
    expect(flag.contentId, 'c2');
    expect(flag.additionalDetails, 'repeated ads');
    expect(flag.contentType, 'comment');
    expect(flag.reason, 'spam');
  });

  test('VoteSubmission constructor', () {
    const vote = VoteSubmission(
      appealId: 'a1',
      vote: 'uphold',
      comment: 'Clearly violates guidelines',
    );
    expect(vote.appealId, 'a1');
    expect(vote.vote, 'uphold');
    expect(vote.comment, 'Clearly violates guidelines');
  });
}

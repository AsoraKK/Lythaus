import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';

void main() {
  test('FlagSubmission retains the supported flag request fields', () {
    const submission = FlagSubmission(
      contentId: 'content-1',
      contentType: 'comment',
      reason: 'spam',
      additionalDetails: 'Repeated ads',
    );

    expect(submission.contentId, 'content-1');
    expect(submission.contentType, 'comment');
    expect(submission.reason, 'spam');
    expect(submission.additionalDetails, 'Repeated ads');
  });
}

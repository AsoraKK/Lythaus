import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ReactionsApi
void main() {
  final instance = LythausApiClient().getReactionsApi();

  group(ReactionsApi, () {
    // Set or remove emotion feedback on a comment
    //
    // Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.
    //
    //Future<ContributionFeedbackChange> commentContributionEmotionSet(String targetId, String idempotencyKey, EmotionFeedbackRequest emotionFeedbackRequest) async
    test('test commentContributionEmotionSet', () async {
      // TODO
    });

    // Read separate quality and emotional feedback for a comment
    //
    // Public visitors can read visible targets; authenticated readers receive their own values and block/mute filtered counts. Returns 404 while this feature is disabled.
    //
    //Future<ContributionFeedbackSummary> commentContributionFeedbackGet(String targetId) async
    test('test commentContributionFeedbackGet', () async {
      // TODO
    });

    // Set or remove quality feedback on a comment
    //
    // Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.
    //
    //Future<ContributionFeedbackChange> commentContributionQualitySet(String targetId, String idempotencyKey, QualityFeedbackRequest qualityFeedbackRequest) async
    test('test commentContributionQualitySet', () async {
      // TODO
    });

    // Set or remove emotion feedback on a post
    //
    // Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.
    //
    //Future<ContributionFeedbackChange> postContributionEmotionSet(String targetId, String idempotencyKey, EmotionFeedbackRequest emotionFeedbackRequest) async
    test('test postContributionEmotionSet', () async {
      // TODO
    });

    // Read separate quality and emotional feedback for a post
    //
    // Public visitors can read visible targets; authenticated readers receive their own values and block/mute filtered counts. Returns 404 while this feature is disabled.
    //
    //Future<ContributionFeedbackSummary> postContributionFeedbackGet(String targetId) async
    test('test postContributionFeedbackGet', () async {
      // TODO
    });

    // Set or remove quality feedback on a post
    //
    // Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.
    //
    //Future<ContributionFeedbackChange> postContributionQualitySet(String targetId, String idempotencyKey, QualityFeedbackRequest qualityFeedbackRequest) async
    test('test postContributionQualitySet', () async {
      // TODO
    });

  });
}

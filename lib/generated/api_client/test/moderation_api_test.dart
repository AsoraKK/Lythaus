import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ModerationApi
void main() {
  final instance = LythausApiClient().getModerationApi();

  group(ModerationApi, () {
    // Flag content for moderation review
    //
    // Flag content for review.
    //
    //Future<FlagContent202Response> flagContent(FlagContentRequest flagContentRequest) async
    test('test flagContent', () async {
      // TODO
    });

    // Flag content for moderation review (v1 route)
    //
    // Alias of `/moderation/flag` — legacy v1 route used by the function runtime.
    //
    //Future<FlagContentV1202Response> flagContentV1(FlagContentV1Request flagContentV1Request) async
    test('test flagContentV1', () async {
      // TODO
    });

    // List the authenticated user's moderation appeals
    //
    // Returns all appeals filed by the calling user, ordered by creation date descending.
    //
    //Future<GetMyAppeals200Response> getMyAppeals({ String status, String cursor }) async
    test('test getMyAppeals', () async {
      // TODO
    });

    // Record a decision on a moderation case
    //
    //Future<JsonObject> moderationCasesDecision(String id, JsonObject body) async
    test('test moderationCasesDecision', () async {
      // TODO
    });

    // Get moderation case detail
    //
    //Future<JsonObject> moderationCasesGet(String id) async
    test('test moderationCasesGet', () async {
      // TODO
    });

    // Appeal a reputation ledger entry
    //
    // Marks an appealable moderation-related ledger entry as under appeal for the authenticated owner.
    //
    //Future<AcceptedResponse> moderationLedgerAppealPost(String entryId) async
    test('test moderationLedgerAppealPost', () async {
      // TODO
    });

    // List moderation queue items
    //
    //Future<JsonObject> moderationQueueList() async
    test('test moderationQueueList', () async {
      // TODO
    });

    // List items in the review queue
    //
    //Future<JsonObject> moderationReviewQueueList() async
    test('test moderationReviewQueueList', () async {
      // TODO
    });

    // Submit content to moderation pipeline for testing
    //
    //Future<JsonObject> moderationTest(JsonObject body) async
    test('test moderationTest', () async {
      // TODO
    });

    // Moderator review decision on an appeal
    //
    // Submit a moderator review decision for an appealed content case. Requires moderator privileges.
    //
    //Future<JsonObject> reviewAppealedContent(String appealId, ReviewAppealedContentRequest reviewAppealedContentRequest) async
    test('test reviewAppealedContent', () async {
      // TODO
    });

    // Submit a moderation appeal (v1 route)
    //
    // Alias of `/moderation/appeals` — legacy v1 route used by the function runtime.
    //
    //Future<AppealCreatedResponse> submitAppealV1(ModerationAppealRequest moderationAppealRequest) async
    test('test submitAppealV1', () async {
      // TODO
    });

    // Submit a moderation appeal
    //
    // File an appeal against a moderation decision. Authenticated users with active accounts may appeal content removals. Daily appeal limits are tier-gated.
    //
    //Future<AppealCreatedResponse> submitModerationAppeal(ModerationAppealRequest moderationAppealRequest) async
    test('test submitModerationAppeal', () async {
      // TODO
    });

    // Cast a community vote on an appeal (v1 route)
    //
    // Alias of `/moderation/appeals/{appealId}/vote` — accepts appealId in the request body.
    //
    //Future<AppealVoteResponse> voteOnAppealV1(VoteOnAppealV1Request voteOnAppealV1Request) async
    test('test voteOnAppealV1', () async {
      // TODO
    });

    // Cast a community vote on an appeal
    //
    // Authenticated community members may cast a weighted vote (`uphold` or `deny`) on an open appeal. Duplicate votes are rejected. Vote eligibility and quorum rules are enforced server-side.
    //
    //Future<AppealVoteResponse> voteOnModerationAppeal(String appealId, AppealVoteRequest appealVoteRequest) async
    test('test voteOnModerationAppeal', () async {
      // TODO
    });

  });
}

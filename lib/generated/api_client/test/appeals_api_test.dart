import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AppealsApi
void main() {
  final instance = LythausApiClient().getAppealsApi();

  group(AppealsApi, () {
    // List pending appeal adjudications
    //
    // Editorial, administrator, and owner roles may list independent appeals awaiting adjudication. Only trained editorial adjudicators may record an adjudication.
    //
    //Future<PendingAppealAdjudicationList> adminAppealsPendingAdjudicationList() async
    test('test adminAppealsPendingAdjudicationList', () async {
      // TODO
    });

    // Set reviewer qualification state
    //
    // Compatibility method for the idempotent qualification update. Reviewer training remains separate from reputation level.
    //
    //Future<ReviewerQualificationResponse> adminReviewerQualificationCreate(String reviewerId, ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest) async
    test('test adminReviewerQualificationCreate', () async {
      // TODO
    });

    // Idempotently set reviewer qualification state
    //
    //Future<ReviewerQualificationResponse> adminReviewerQualificationUpdate(String reviewerId, ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest) async
    test('test adminReviewerQualificationUpdate', () async {
      // TODO
    });

    // List my appeal-review assignments
    //
    //Future<AppealReviewerAssignments> appealReviewerAssignmentsList() async
    test('test appealReviewerAssignmentsList', () async {
      // TODO
    });

    // Submit an appeal
    //
    // Dispatches by the activated policy. Monthly-policy cases await safe evidence triage before timed equal-vote community review. Historical cases retain their labelled assignment policy. Unapproved community configuration returns 503.
    //
    //Future<AppealCreateResponse> appealsCreate(AppealCreateRequest appealCreateRequest, { String idempotencyKey }) async
    test('test appealsCreate', () async {
      // TODO
    });

    // Get a private appeal under its recorded policy
    //
    // Monthly-policy peers receive only safe evidence and their own ballot. Restricted cases are visible only to their appellant without an evidence preview. Live totals and voter identities are never returned. Historical assigned-reviewer access is preserved.
    //
    //Future<AppealDetailResponse> appealsGet(String id) async
    test('test appealsGet', () async {
      // TODO
    });

    // Publicly record reviewer recusal
    //
    // Only an independently assigned reviewer may recuse an open appeal. The assigned state becomes recused and the review cannot be restored by this endpoint.
    //
    //Future<AppealRecusalResponse> appealsRecuse(String appealId, String idempotencyKey) async
    test('test appealsRecuse', () async {
      // TODO
    });

    // Record a ballot under the case policy
    //
    // Monthly-policy ballots have weight one for every eligible email-verified member and use an expected revision; configured changes stop at the server deadline. Historical cases accept the original immutable assigned-reviewer vote. No live totals or other voter identities are returned.
    //
    //Future<GovernanceAppealVoteResponse> appealsVote(String appealId, String idempotencyKey, GovernanceAppealVoteRequest governanceAppealVoteRequest) async
    test('test appealsVote', () async {
      // TODO
    });

    // List private eligible community reviews
    //
    // Random case ordering; no selected panel, live counts, voter identities or restricted evidence. Requires approved configuration and a verified eligible account. No suitable cases returns no_case_available.
    //
    //Future<CommunityAppealQueue> communityAppealsQueue() async
    test('test communityAppealsQueue', () async {
      // TODO
    });

    // Withdraw an owned community appeal before closure
    //
    //Future<CommunityAppealWithdrawal> communityAppealsWithdraw(String appealId, { String idempotencyKey }) async
    test('test communityAppealsWithdraw', () async {
      // TODO
    });

  });
}

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
    // The case determines standard or high risk; the service assigns independent trained reviewers.
    //
    //Future<AppealCreateResponse> appealsCreate(AppealCreateRequest appealCreateRequest, { String idempotencyKey }) async
    test('test appealsCreate', () async {
      // TODO
    });

    // Get an appeal visible to its appellant or assigned reviewer
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

    // Submit one immutable reviewer vote
    //
    // Only an independently assigned trained reviewer may vote. A vote is locked and cannot be changed.
    //
    //Future<GovernanceAppealVoteResponse> appealsVote(String appealId, String idempotencyKey, GovernanceAppealVoteRequest governanceAppealVoteRequest) async
    test('test appealsVote', () async {
      // TODO
    });

  });
}

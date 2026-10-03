import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ReputationApi
void main() {
  final instance = LythausApiClient().getReputationApi();

  group(ReputationApi, () {
    // Record a scoped contextual contribution review
    //
    // Requires a verified Cloudflare Access JWT, active owner, administrator, or moderator membership authorised for this review, and an allowed Origin. The handler binds the reviewer to the current comment, thread and parent revisions. Actor identity and rules version come from server context. evidenceReference is a caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets; this value is omitted from the response. The request cannot submit points. The route remains unavailable until its separate configuration and collection gates are enabled.
    //
    //Future<MonthlyContextReviewResponse> adminMonthlyContextReview(String commentId, MonthlyContextReviewRequest monthlyContextReviewRequest) async
    test('test adminMonthlyContextReview', () async {
      // TODO
    });

    // Export my monthly reputation report as CSV
    //
    // Returns the authenticated member's private formula-safe CSV export for one calendar source month. Raw evidence identifiers and private ballots are omitted. The response is marked private and no-store.
    //
    //Future<String> downloadMyMonthlyReputationReportCsv(String sourceMonth) async
    test('test downloadMyMonthlyReputationReportCsv', () async {
      // TODO
    });

    // Read or export my monthly reputation report
    //
    // Returns the authenticated member's private JSON report for one calendar source month. It includes selected and omitted assigned weeks, action allowances and accepted/withheld/pending totals, monthly and quarterly email validity, fixed next-calendar-month authority, and correction history. Raw evidence identifiers and private ballots are not returned. The report may remain pending while policy or settlement gates are unresolved.
    //
    //Future<MonthlyReputationReportResponse> getMyMonthlyReputationReport(String sourceMonth) async
    test('test getMyMonthlyReputationReport', () async {
      // TODO
    });

    // List my Reputation V2 ledger
    //
    //Future<ReputationLedgerPage> reputationLedgerGet({ String cursor, int limit }) async
    test('test reputationLedgerGet', () async {
      // TODO
    });

    // Get my private Reputation V2 summary
    //
    //Future<ReputationPrivateV2> reputationMeGet() async
    test('test reputationMeGet', () async {
      // TODO
    });

    // Get public Reputation V2 summary
    //
    //Future<ReputationPublicV2> reputationUserGet(String id) async
    test('test reputationUserGet', () async {
      // TODO
    });

    // Get public Reputation V2 summary (compatibility alias)
    //
    //Future<ReputationPublicV2> reputationUserGetSingular(String id) async
    test('test reputationUserGetSingular', () async {
      // TODO
    });

  });
}

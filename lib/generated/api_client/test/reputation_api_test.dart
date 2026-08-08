import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ReputationApi
void main() {
  final instance = LythausApiClient().getReputationApi();

  group(ReputationApi, () {
    // Appeal a reputation ledger entry
    //
    // Marks an appealable moderation-related ledger entry as under appeal for the authenticated owner.
    //
    //Future<AcceptedResponse> moderationLedgerAppealPost(String entryId) async
    test('test moderationLedgerAppealPost', () async {
      // TODO
    });

    // Get my reputation ledger
    //
    // Returns user-visible reputation events. Internal reason codes, raw deltas, authenticity scores, and anti-abuse scores are excluded.
    //
    //Future<LedgerPage> reputationLedgerGet({ String filter, String cursor, int limit }) async
    test('test reputationLedgerGet', () async {
      // TODO
    });

    // Get my reputation summary
    //
    // Returns the authenticated user's reputation level, band, pillar scores, and eligibility statuses. Raw formulas and internal risk scores are not returned.
    //
    //Future<ReputationSummary> reputationMeGet() async
    test('test reputationMeGet', () async {
      // TODO
    });

    // Get public reputation view
    //
    //Future<PublicReputationView> reputationUserGet(String id) async
    test('test reputationUserGet', () async {
      // TODO
    });

    // Get public reputation view
    //
    //Future<PublicReputationView> reputationUserGetSingular(String id) async
    test('test reputationUserGetSingular', () async {
      // TODO
    });

  });
}

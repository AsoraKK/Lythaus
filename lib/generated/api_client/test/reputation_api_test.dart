import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ReputationApi
void main() {
  final instance = LythausApiClient().getReputationApi();

  group(ReputationApi, () {
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

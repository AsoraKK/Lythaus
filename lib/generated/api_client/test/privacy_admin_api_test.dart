import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PrivacyAdminApi
void main() {
  final instance = LythausApiClient().getPrivacyAdminApi();

  group(PrivacyAdminApi, () {
    // Clear an existing legal hold
    //
    // Removes a previously placed legal hold, allowing normal data lifecycle operations (including deletion) to resume.
    //
    //Future clearLegalHold(LegalHoldClear legalHoldClear) async
    test('test clearLegalHold', () async {
      // TODO
    });

    // Enqueue a Data Subject Request delete
    //
    // Queues a deletion job for a user's data as part of GDPR/CCPA right-to-erasure compliance. Returns immediately with job tracking info.
    //
    //Future<DsrRequestSummary> enqueueDsrDelete(DsrRequestInput dsrRequestInput) async
    test('test enqueueDsrDelete', () async {
      // TODO
    });

    // Enqueue a Data Subject Request export
    //
    // Queues an export job for a user's data as part of GDPR/CCPA compliance. Returns immediately with job tracking info.
    //
    //Future<DsrRequestSummary> enqueueDsrExport(DsrRequestInput dsrRequestInput) async
    test('test enqueueDsrExport', () async {
      // TODO
    });

    // Place a legal hold
    //
    // Places a legal hold on a user's data, preventing deletion until the hold is cleared. Used for litigation or regulatory preservation.
    //
    //Future<LegalHoldRecord> placeLegalHold(LegalHoldInput legalHoldInput) async
    test('test placeLegalHold', () async {
      // TODO
    });

  });
}

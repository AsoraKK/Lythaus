import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for MemberActionVerificationReceipt
void main() {
  final instance = MemberActionVerificationReceiptBuilder();
  // TODO add properties to the builder and call build()

  group(MemberActionVerificationReceipt, () {
    // Opaque one-use proof, bound to this account/session/action/request. Send only to the intended API in X-Lythaus-Action-Verification; do not persist, log or forward on redirects.
    // String proof
    test('to test the property `proof`', () async {
      // TODO
    });

    // DateTime verifiedAt
    test('to test the property `verifiedAt`', () async {
      // TODO
    });

    // Exactly five minutes after verifiedAt, enforced using server DB time.
    // DateTime expiresAt
    test('to test the property `expiresAt`', () async {
      // TODO
    });

    // String action
    test('to test the property `action`', () async {
      // TODO
    });

    // Optional evidence-collection outcome only. Inactive or unavailable collection never implies monthly eligibility, protection coverage, a point award or a reputation deduction.
    // BuiltMap<String, JsonObject> maintenanceEvidence
    test('to test the property `maintenanceEvidence`', () async {
      // TODO
    });

  });
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AuthenticityBetaApi
void main() {
  final instance = LythausApiClient().getAuthenticityBetaApi();

  group(AuthenticityBetaApi, () {
    // Cancel unfinished analysis
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaActionResponse> authenticityBetaCancel(String caseId, String idempotencyKey) async
    test('test authenticityBetaCancel', () async {
      // TODO
    });

    // Submit private feedback
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaActionResponse> authenticityBetaFeedback(String caseId, String idempotencyKey, BetaFeedback betaFeedback) async
    test('test authenticityBetaFeedback', () async {
      // TODO
    });

    // Finish the immutable upload
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaActionResponse> authenticityBetaFinalise(String caseId, String idempotencyKey) async
    test('test authenticityBetaFinalise', () async {
      // TODO
    });

    // Request review or appeal a review
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaActionResponse> authenticityBetaReview(String caseId, String idempotencyKey, BetaFeedback betaFeedback) async
    test('test authenticityBetaReview', () async {
      // TODO
    });

    // Create an upload case
    //
    // Private original-byte upload; at most 10 MiB and 16,777,216 decoded pixels, one RGB PNG/JPEG frame, at least 256 pixels per side. Oversized inputs are rejected without resizing. Source history determines interpretation separately from successful inference.
    //
    //Future<BetaUpload> createAuthenticityBetaCase(String idempotencyKey, BetaSubmission betaSubmission) async
    test('test createAuthenticityBetaCase', () async {
      // TODO
    });

    // Invalidate and delete your case
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaActionResponse> deleteAuthenticityBetaCase(String caseId, String idempotencyKey) async
    test('test deleteAuthenticityBetaCase', () async {
      // TODO
    });

    // Read a private case
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaCase> getAuthenticityBetaCase(String caseId) async
    test('test getAuthenticityBetaCase', () async {
      // TODO
    });

    // Read the private display derivative
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<Uint8List> getAuthenticityBetaImage(String caseId) async
    test('test getAuthenticityBetaImage', () async {
      // TODO
    });

    // List your private beta cases
    //
    // Private, non-enforcing beta. Responses are no-store. Polling never starts inference.
    //
    //Future<BetaCaseList> listAuthenticityBetaCases() async
    test('test listAuthenticityBetaCases', () async {
      // TODO
    });

  });
}

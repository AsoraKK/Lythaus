import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PrivacyApi
void main() {
  final instance = LythausApiClient().getPrivacyApi();

  group(PrivacyApi, () {
    // Submit an asynchronous privacy request
    //
    // Records an export, account deletion, or rectification request and queues it for durable processing. Acceptance does not mean processing is complete.
    //
    //Future<PrivacyRequestAccepted> privacyRequestCreate(PrivacyRequestCreate privacyRequestCreate, { String idempotencyKey }) async
    test('test privacyRequestCreate', () async {
      // TODO
    });

    // Get the latest privacy request status
    //
    // Returns the authenticated user's latest matching asynchronous privacy request.
    //
    //Future<PrivacyRequestStatusResponse> privacyRequestStatus({ String requestType }) async
    test('test privacyRequestStatus', () async {
      // TODO
    });

  });
}

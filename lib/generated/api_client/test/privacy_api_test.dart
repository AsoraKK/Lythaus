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

    // Download my completed privacy export
    //
    // Streams the authenticated subject's unexpired completed export as a private JSON attachment. The success payload is the export file itself, not an API envelope. Access is recorded as the `privacy.export_accessed` activity event.
    //
    //Future<BuiltMap<String, JsonObject>> privacyRequestExportDownload(String requestId) async
    test('test privacyRequestExportDownload', () async {
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

    // Get the authenticated user's private storage ledger
    //
    //Future<StorageUsageGet200Response> storageUsageGet() async
    test('test storageUsageGet', () async {
      // TODO
    });

    // Update private region and visibility preferences
    //
    //Future<UsersMeRegionUpdate200Response> usersMeRegionUpdate(String idempotencyKey, UsersMeRegionUpdateRequest usersMeRegionUpdateRequest) async
    test('test usersMeRegionUpdate', () async {
      // TODO
    });

    // Update a private content-retention rule
    //
    //Future<UsersMeRetentionUpdate200Response> usersMeRetentionUpdate(String idempotencyKey, UsersMeRetentionUpdateRequest usersMeRetentionUpdateRequest) async
    test('test usersMeRetentionUpdate', () async {
      // TODO
    });

  });
}

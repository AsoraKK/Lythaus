import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PrivacyApi
void main() {
  final instance = LythausApiClient().getPrivacyApi();

  group(PrivacyApi, () {
    // Read own account-linked activity consent
    //
    //Future<ActivityConsent> getActivityMeasurementConsent() async
    test('test getActivityMeasurementConsent', () async {
      // TODO
    });

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

    // Record one canonical account and UTC active day
    //
    // Authenticated visible foreground render only, including an empty feed. No background heartbeat, browsing URL, content, identity or client timestamp is accepted. Server deduplication and current consent episode checks are transactional. Signal is client-asserted visibility, not human-attention attestation. Existing authenticated origin/CSRF and rate limits are dispatcher prerequisites.
    //
    //Future<RecordForegroundActivityDay200Response> recordForegroundActivityDay(ActivityRenderInput activityRenderInput) async
    test('test recordForegroundActivityDay', () async {
      // TODO
    });

    // Explicitly grant or withdraw this account-linked purpose
    //
    // Existing anonymous consent does not authorize this purpose. Withdrawal remains possible while collection is disabled; dates are removed transactionally unless an existing legal hold requires preservation. Held dates are excluded from metrics and collection. Activation also requires approved retention terms. Existing account consent decisions remain exportable. Existing authenticated origin/CSRF and rate limits are mandatory dispatcher prerequisites.
    //
    //Future<ActivityConsent> setActivityMeasurementConsent(ActivityConsentInput activityConsentInput) async
    test('test setActivityMeasurementConsent', () async {
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

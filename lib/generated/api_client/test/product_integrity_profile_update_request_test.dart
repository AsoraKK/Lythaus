import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for ProductIntegrityProfileUpdateRequest
void main() {
  final instance = ProductIntegrityProfileUpdateRequestBuilder();
  // TODO add properties to the builder and call build()

  group(ProductIntegrityProfileUpdateRequest, () {
    // Optional public display name. Saved edits remain private during publication review. Names are normalized and screened by the Lythaus profile-name policy.
    // String displayName
    test('to test the property `displayName`', () async {
      // TODO
    });

    // String bio
    test('to test the property `bio`', () async {
      // TODO
    });

    // String trustPassportVisibility
    test('to test the property `trustPassportVisibility`', () async {
      // TODO
    });

    // Private encrypted accountability name. It is never returned by profile or activity APIs.
    // String accountabilityName
    test('to test the property `accountabilityName`', () async {
      // TODO
    });

    // Private account presentation choices. Send this field alone; it does not change profile publication or Passport visibility. Requires the approved preference schema. Conflicts return 409; unavailable storage returns 503.
    // ProductIntegrityPresentationPreferencesUpdate presentationPreferences
    test('to test the property `presentationPreferences`', () async {
      // TODO
    });

  });
}

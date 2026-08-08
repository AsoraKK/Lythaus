import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for AdminSetUserTierRequest
void main() {
  final instance = AdminSetUserTierRequestBuilder();
  // TODO add properties to the builder and call build()

  group(AdminSetUserTierRequest, () {
    // String tier
    test('to test the property `tier`', () async {
      // TODO
    });

    // String reason
    test('to test the property `reason`', () async {
      // TODO
    });

    // Required for Premium and Black Alpha grants; no more than 90 days ahead.
    // DateTime expiresAt
    test('to test the property `expiresAt`', () async {
      // TODO
    });

    // Required for Premium and Black Alpha grants; on or before expiresAt.
    // DateTime reviewAt
    test('to test the property `reviewAt`', () async {
      // TODO
    });

  });
}

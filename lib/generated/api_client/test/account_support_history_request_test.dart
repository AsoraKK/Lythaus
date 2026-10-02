import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for AccountSupportHistoryRequest
void main() {
  final instance = AccountSupportHistoryRequestBuilder();
  // TODO add properties to the builder and call build()

  group(AccountSupportHistoryRequest, () {
    // Use a machine reason code without personal information; it is trimmed and normalized to uppercase.
    // String reasonCode
    test('to test the property `reasonCode`', () async {
      // TODO
    });

    // String source_
    test('to test the property `source_`', () async {
      // TODO
    });

    // String eventType
    test('to test the property `eventType`', () async {
      // TODO
    });

    // String correlationId
    test('to test the property `correlationId`', () async {
      // TODO
    });

    // Inclusive UTC start, with at most six fractional digits; must precede until.
    // DateTime since
    test('to test the property `since`', () async {
      // TODO
    });

    // Exclusive UTC end, with at most six fractional digits.
    // DateTime until
    test('to test the property `until`', () async {
      // TODO
    });

    // String order (default value: 'newest')
    test('to test the property `order`', () async {
      // TODO
    });

    // int limit (default value: 25)
    test('to test the property `limit`', () async {
      // TODO
    });

    // Opaque keyset cursor, bound to user, filters, order and the first page's snapshot. Preserve it unchanged and keep the same filters for subsequent pages.
    // String cursor
    test('to test the property `cursor`', () async {
      // TODO
    });

  });
}

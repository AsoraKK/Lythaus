import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for ModerationAppealRequest
void main() {
  final instance = ModerationAppealRequestBuilder();
  // TODO add properties to the builder and call build()

  group(ModerationAppealRequest, () {
    // Identifier of the moderation case being appealed
    // String caseId
    test('to test the property `caseId`', () async {
      // TODO
    });

    // User's statement explaining why the decision should be reversed
    // String statement
    test('to test the property `statement`', () async {
      // TODO
    });

    // Optional supporting evidence URLs
    // BuiltList<String> evidenceUrls
    test('to test the property `evidenceUrls`', () async {
      // TODO
    });

  });
}

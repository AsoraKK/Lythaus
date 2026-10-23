import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for MemberActionVerificationRequestOperation
void main() {
  final instance = MemberActionVerificationRequestOperationBuilder();
  // TODO add properties to the builder and call build()

  group(MemberActionVerificationRequestOperation, () {
    // String method
    test('to test the property `method`', () async {
      // TODO
    });

    // Exact canonical /api path and query of the intended reward redemption or privacy deletion request. Actor, action and session identity are derived by the server.
    // String path
    test('to test the property `path`', () async {
      // TODO
    });

    // Exact UTF-8 body text used by the mutation, at most 8192 bytes. Reward redemption may use an empty body; privacy deletion uses requestType delete JSON. Whitespace, property order and query bytes are bound to the proof.
    // String body
    test('to test the property `body`', () async {
      // TODO
    });

  });
}

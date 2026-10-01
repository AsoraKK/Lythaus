import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for EmailVerificationRequest
void main() {
  final instance = EmailVerificationRequestBuilder();
  // TODO add properties to the builder and call build()

  group(EmailVerificationRequest, () {
    // Single-use opaque email-verification token.
    // String token
    test('to test the property `token`', () async {
      // TODO
    });

    // Mailbox owner chooses the usable credential here, preventing activation of an attacker-chosen pre-registration password. Unicode code points are preserved, not normalized.
    // String password
    test('to test the property `password`', () async {
      // TODO
    });

  });
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for EmailAuthRequest
void main() {
  final instance = EmailAuthRequestBuilder();
  // TODO add properties to the builder and call build()

  group(EmailAuthRequest, () {
    // String mode (default value: 'login')
    test('to test the property `mode`', () async {
      // TODO
    });

    // String email
    test('to test the property `email`', () async {
      // TODO
    });

    // Login verifies existing 12–14 character credentials without imposing the new-creation minimum. Registration requires 15–128 Unicode code points, preserved exactly.
    // String password
    test('to test the property `password`', () async {
      // TODO
    });

    // String turnstileToken
    test('to test the property `turnstileToken`', () async {
      // TODO
    });

  });
}

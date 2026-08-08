import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for EmailSessionResponseData
void main() {
  final instance = EmailSessionResponseDataBuilder();
  // TODO add properties to the builder and call build()

  group(EmailSessionResponseData, () {
    // Short-lived JWT bearer token (15 min)
    // String accessToken
    test('to test the property `accessToken`', () async {
      // TODO
    });

    // Long-lived opaque refresh token
    // String refreshToken
    test('to test the property `refreshToken`', () async {
      // TODO
    });

    // String tokenType
    test('to test the property `tokenType`', () async {
      // TODO
    });

    // Access token lifetime in seconds
    // int expiresIn
    test('to test the property `expiresIn`', () async {
      // TODO
    });

  });
}

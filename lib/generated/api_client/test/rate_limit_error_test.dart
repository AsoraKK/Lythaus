import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for RateLimitError
void main() {
  final instance = RateLimitErrorBuilder();
  // TODO add properties to the builder and call build()

  group(RateLimitError, () {
    // Constant identifier for rate limit breaches
    // String error
    test('to test the property `error`', () async {
      // TODO
    });

    // Scope of the limit that triggered the breach
    // String scope
    test('to test the property `scope`', () async {
      // TODO
    });

    // Maximum requests permitted within the window
    // int limit
    test('to test the property `limit`', () async {
      // TODO
    });

    // Window size for the limit in seconds
    // int windowSeconds
    test('to test the property `windowSeconds`', () async {
      // TODO
    });

    // Seconds until the limit resets
    // int retryAfterSeconds
    test('to test the property `retryAfterSeconds`', () async {
      // TODO
    });

    // Correlation identifier for tracing
    // String traceId
    test('to test the property `traceId`', () async {
      // TODO
    });

    // Additional context for specialized scopes (e.g. auth backoff)
    // String reason
    test('to test the property `reason`', () async {
      // TODO
    });

  });
}

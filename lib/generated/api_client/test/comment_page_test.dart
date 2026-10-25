import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for CommentPage
void main() {
  final instance = CommentPageBuilder();
  // TODO add properties to the builder and call build()

  group(CommentPage, () {
    // Opaque cursor for the next page, or null when exhausted.
    // String nextCursor
    test('to test the property `nextCursor`', () async {
      // TODO
    });

    // Reply tail cursor for an explicit check for new replies.
    // String refreshCursor
    test('to test the property `refreshCursor`', () async {
      // TODO
    });

    // Authoritative current rows for the requested cached root/reply IDs. Missing IDs are unavailable; tombstones have no body. Canonical roots include their current visible reply count. Only the signed-in author's eligible pending body may be returned privately.
    // BuiltList<Comment> revalidatedItems
    test('to test the property `revalidatedItems`', () async {
      // TODO
    });

    // CommentPageAllOfCapabilities capabilities
    test('to test the property `capabilities`', () async {
      // TODO
    });

    // BuiltList<Comment> items
    test('to test the property `items`', () async {
      // TODO
    });

  });
}

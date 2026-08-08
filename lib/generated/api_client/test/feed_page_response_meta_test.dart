import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for FeedPageResponseMeta
void main() {
  final instance = FeedPageResponseMetaBuilder();
  // TODO add properties to the builder and call build()

  group(FeedPageResponseMeta, () {
    // Number of items returned
    // int count
    test('to test the property `count`', () async {
      // TODO
    });

    // Cursor for fetching the next page; null when no further pages exist
    // String nextCursor
    test('to test the property `nextCursor`', () async {
      // TODO
    });

    // Server-side timing breakdown (ms)
    // BuiltMap<String, num> timingsMs
    test('to test the property `timingsMs`', () async {
      // TODO
    });

    // Applied ranking modifiers and personalization signals
    // BuiltMap<String, JsonObject> applied
    test('to test the property `applied`', () async {
      // TODO
    });

  });
}

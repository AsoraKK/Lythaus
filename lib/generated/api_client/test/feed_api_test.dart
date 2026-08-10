import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for FeedApi
void main() {
  final instance = LythausApiClient().getFeedApi();

  group(FeedApi, () {
    // List the public discovery feed
    //
    // Anonymous callers receive the public page. Authenticated callers additionally receive block and mute filtering.
    //
    //Future<DiscoveryFeedPage> feedDiscover({ String cursor, int limit }) async
    test('test feedDiscover', () async {
      // TODO
    });

    // List the authenticated personal feed
    //
    //Future<PersonalFeedPage> feedList({ String cursor, int limit }) async
    test('test feedList', () async {
      // TODO
    });

    // List the Black-tier News Board
    //
    // This is an authenticated Black-only entitlement. Free and Premium callers receive a forbidden response; there is no preview contract.
    //
    //Future<NewsBoardFeedPage> feedNews({ String cursor, int limit }) async
    test('test feedNews', () async {
      // TODO
    });

    // List the Black-tier News Board
    //
    // Compatibility alias for `/feed/news`. This is an authenticated Black-only entitlement.
    //
    //Future<NewsBoardFeedPage> newsBoardGetLegacy({ String cursor, int limit }) async
    test('test newsBoardGetLegacy', () async {
      // TODO
    });

  });
}

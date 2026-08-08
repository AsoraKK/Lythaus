import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for FeedApi
void main() {
  final instance = LythausApiClient().getFeedApi();

  group(FeedApi, () {
    // Return discovery/explore feed
    //
    //Future<JsonObject> feedDiscover() async
    test('test feedDiscover', () async {
      // TODO
    });

    // Return News Board feed
    //
    // Return authenticated News Board posts. Free receives a maximum three-item preview with no cursor; Premium and Black receive the full board. Admin is an authorization role, not a commercial tier. Publishing remains restricted to editorial contributors and approved ingestion paths.
    //
    //Future<NewsBoardFeedResponse> feedNews({ String cursor, int limit, String region }) async
    test('test feedNews', () async {
      // TODO
    });

    // Retrieve public discovery feed
    //
    // Public feed surface using ranking safety filters and reputation-derived trust weighting without paid-tier boosting.
    //
    //Future<FeedPageResponse> feedPublicGet({ String cursor, int limit, String includeTopics, String excludeTopics }) async
    test('test feedPublicGet', () async {
      // TODO
    });

    // Return a public user's post feed
    //
    //Future<JsonObject> feedUser(String userId) async
    test('test feedUser', () async {
      // TODO
    });

    // Retrieve personalized feed items
    //
    // Return a page of feed items.
    //
    //Future<FeedPageEnvelope> getFeed({ String cursor, int limit }) async
    test('test getFeed', () async {
      // TODO
    });

  });
}

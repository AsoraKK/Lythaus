import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for CustomFeedsApi
void main() {
  final instance = LythausApiClient().getCustomFeedsApi();

  group(CustomFeedsApi, () {
    // Create a custom feed
    //
    // Tier limits are Free 1, Premium 2, and Black 3 custom feeds.
    //
    //Future<CustomFeed> customFeedsCreate(CustomFeedCreateRequest customFeedCreateRequest, { String idempotencyKey }) async
    test('test customFeedsCreate', () async {
      // TODO
    });

    // Delete an owned custom feed
    //
    //Future<CustomFeedDeleteResponse> customFeedsDelete(String id, { String idempotencyKey }) async
    test('test customFeedsDelete', () async {
      // TODO
    });

    // Get an owned custom feed
    //
    //Future<CustomFeed> customFeedsGet(String id) async
    test('test customFeedsGet', () async {
      // TODO
    });

    // List items from an owned custom feed
    //
    //Future<DiscoveryFeedPage> customFeedsItemsList(String id, { String cursor, int limit }) async
    test('test customFeedsItemsList', () async {
      // TODO
    });

    // List my custom feeds
    //
    //Future<CustomFeedList> customFeedsList() async
    test('test customFeedsList', () async {
      // TODO
    });

    // Replace an owned custom feed
    //
    //Future<CustomFeed> customFeedsReplace(String id, CustomFeedUpdateRequest customFeedUpdateRequest, { String idempotencyKey }) async
    test('test customFeedsReplace', () async {
      // TODO
    });

    // Partially update an owned custom feed
    //
    //Future<CustomFeed> customFeedsUpdate(String id, CustomFeedUpdateRequest customFeedUpdateRequest, { String idempotencyKey }) async
    test('test customFeedsUpdate', () async {
      // TODO
    });

  });
}

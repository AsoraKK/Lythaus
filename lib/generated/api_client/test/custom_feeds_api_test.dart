import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for CustomFeedsApi
void main() {
  final instance = LythausApiClient().getCustomFeedsApi();

  group(CustomFeedsApi, () {
    // Create a new custom feed
    //
    // Create a custom feed definition. The service enforces tier limits: Free users may create 1 custom feed, Premium users 2, Black users 3, and Admin users 20.
    //
    //Future<CustomFeedDefinition> customFeedsCreate(CreateCustomFeedRequest createCustomFeedRequest) async
    test('test customFeedsCreate', () async {
      // TODO
    });

    // Delete a custom feed
    //
    // Delete an owned custom feed definition.
    //
    //Future customFeedsDelete(String id) async
    test('test customFeedsDelete', () async {
      // TODO
    });

    // Get a custom feed
    //
    // Fetch a custom feed definition owned by the authenticated user.
    //
    //Future<CustomFeedDefinition> customFeedsGet(String id) async
    test('test customFeedsGet', () async {
      // TODO
    });

    // List items in a custom feed
    //
    // Return posts matching a custom feed's filters.
    //
    //Future<CursorPaginatedPostView> customFeedsItemsList(String id, { String cursor, int limit }) async
    test('test customFeedsItemsList', () async {
      // TODO
    });

    // List custom feeds for the current user
    //
    // List custom feed definitions owned by the authenticated user.
    //
    //Future<CustomFeedListResponse> customFeedsList({ String cursor, int limit }) async
    test('test customFeedsList', () async {
      // TODO
    });

    // Update a custom feed
    //
    // Update an owned custom feed's name, filters, sorting, or home flag.
    //
    //Future<CustomFeedDefinition> customFeedsUpdate(String id, UpdateCustomFeedRequest updateCustomFeedRequest) async
    test('test customFeedsUpdate', () async {
      // TODO
    });

  });
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for UsersApi
void main() {
  final instance = LythausApiClient().getUsersApi();

  group(UsersApi, () {
    // Get a public user profile
    //
    //Future<JsonObject> usersGet(String id) async
    test('test usersGet', () async {
      // TODO
    });

    // Update private region and visibility preferences
    //
    //Future<UsersMeRegionUpdate200Response> usersMeRegionUpdate(String idempotencyKey, UsersMeRegionUpdateRequest usersMeRegionUpdateRequest) async
    test('test usersMeRegionUpdate', () async {
      // TODO
    });

    // Update a private content-retention rule
    //
    //Future<UsersMeRetentionUpdate200Response> usersMeRetentionUpdate(String idempotencyKey, UsersMeRetentionUpdateRequest usersMeRetentionUpdateRequest) async
    test('test usersMeRetentionUpdate', () async {
      // TODO
    });

  });
}

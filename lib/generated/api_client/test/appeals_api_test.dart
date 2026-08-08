import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AppealsApi
void main() {
  final instance = LythausApiClient().getAppealsApi();

  group(AppealsApi, () {
    // Submit a new appeal
    //
    //Future<JsonObject> appealsCreate(JsonObject body) async
    test('test appealsCreate', () async {
      // TODO
    });

    // Get appeal detail
    //
    //Future<JsonObject> appealsGet(String id) async
    test('test appealsGet', () async {
      // TODO
    });

    // Cast a community vote on an appeal
    //
    //Future<JsonObject> appealsVote(String id, JsonObject body) async
    test('test appealsVote', () async {
      // TODO
    });

  });
}

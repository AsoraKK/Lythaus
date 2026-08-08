import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AnalyticsApi
void main() {
  final instance = LythausApiClient().getAnalyticsApi();

  group(AnalyticsApi, () {
    // Ingest client-side analytics events
    //
    //Future<JsonObject> analyticsEventsCreate(JsonObject body) async
    test('test analyticsEventsCreate', () async {
      // TODO
    });

  });
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for HealthApi
void main() {
  final instance = LythausApiClient().getHealthApi();

  group(HealthApi, () {
    // Service health probe
    //
    // Liveness/readiness check. No auth.
    //
    //Future<GetHealth200Response> getHealth() async
    test('test getHealth', () async {
      // TODO
    });

    // Readiness probe
    //
    //Future<JsonObject> ready() async
    test('test ready', () async {
      // TODO
    });

  });
}

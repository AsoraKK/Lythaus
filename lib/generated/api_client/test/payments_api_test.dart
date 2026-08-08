import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PaymentsApi
void main() {
  final instance = LythausApiClient().getPaymentsApi();

  group(PaymentsApi, () {
    // Handle payment provider webhook
    //
    //Future<JsonObject> paymentsWebhook(JsonObject body) async
    test('test paymentsWebhook', () async {
      // TODO
    });

  });
}

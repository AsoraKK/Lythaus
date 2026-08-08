import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ReactionsApi
void main() {
  final instance = LythausApiClient().getReactionsApi();

  group(ReactionsApi, () {
    // Delete my reaction
    //
    //Future reactionsDelete(String id) async
    test('test reactionsDelete', () async {
      // TODO
    });

    // Submit a structured reaction
    //
    // Records a structured reaction and applies anti-gaming controls before deciding whether it contributes to reputation.
    //
    //Future<SubmitReactionResponse> reactionsPost(SubmitReactionRequest submitReactionRequest) async
    test('test reactionsPost', () async {
      // TODO
    });

  });
}

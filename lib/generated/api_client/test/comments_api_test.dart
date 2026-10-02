import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for CommentsApi
void main() {
  final instance = LythausApiClient().getCommentsApi();

  group(CommentsApi, () {
    // Read the author's own allowed or pending comment
    //
    // Known-ID read bound to the comment author, regardless of post ownership. No foreign parent body or moderation signals are exposed.
    //
    //Future<CommentsOwnerView200Response> commentsOwnerView(String commentId) async
    test('test commentsOwnerView', () async {
      // TODO
    });

  });
}

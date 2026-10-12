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

    // List my own comments and replies
    //
    // Private newest-first cursor collection bound to the active JWT subject. Returns only the author's non-deleted allowed or pending human or AI-assisted comments on currently accessible allowed posts, using existing post visibility, authorship, follow, block and public-label rules. Deleted, blocked or inactive content and foreign bodies are excluded. Parent comment bodies are never returned.
    //
    //Future<OwnerCommentsPage> usersMeCommentsList({ int limit, String cursor }) async
    test('test usersMeCommentsList', () async {
      // TODO
    });

  });
}

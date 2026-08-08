import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PostsApi
void main() {
  final instance = LythausApiClient().getPostsApi();

  group(PostsApi, () {
    // Create a new post
    //
    // Create a new post.
    //
    //Future<LegacyCreatePostResponse> createPost(CreatePostRequest createPostRequest) async
    test('test createPost', () async {
      // TODO
    });

    // Bookmark a post
    //
    //Future<JsonObject> postsBookmarkCreate(String id, JsonObject body) async
    test('test postsBookmarkCreate', () async {
      // TODO
    });

    // Remove a bookmark
    //
    //Future<JsonObject> postsBookmarkDelete(String id) async
    test('test postsBookmarkDelete', () async {
      // TODO
    });

    // Get bookmark status for a post
    //
    //Future<JsonObject> postsBookmarkGet(String id) async
    test('test postsBookmarkGet', () async {
      // TODO
    });

    // Create a comment on a post
    //
    //Future<JsonObject> postsCommentsCreate(String postId, JsonObject body) async
    test('test postsCommentsCreate', () async {
      // TODO
    });

    // List comments on a post
    //
    //Future<JsonObject> postsCommentsList(String postId) async
    test('test postsCommentsList', () async {
      // TODO
    });

    // Create a post with moderation and AI authenticity checks
    //
    // Create a post for the authenticated user. An authorship disclosure is required. Disclosed AI-assisted and AI-generated content may be published with categorical labels; conflicts or unavailable classification enter review. Prohibited content remains blocked regardless of authorship.
    //
    //Future<Post> postsCreate(CreatePostRequest createPostRequest) async
    test('test postsCreate', () async {
      // TODO
    });

    // Get a post by ID
    //
    //Future<PostView> postsGet(String id) async
    test('test postsGet', () async {
      // TODO
    });

    // Get engagement insights for a post
    //
    //Future<JsonObject> postsInsights(String id) async
    test('test postsInsights', () async {
      // TODO
    });

    // Like a post
    //
    //Future<JsonObject> postsLikeCreate(String id, JsonObject body) async
    test('test postsLikeCreate', () async {
      // TODO
    });

    // Unlike a post
    //
    //Future<JsonObject> postsLikeDelete(String id) async
    test('test postsLikeDelete', () async {
      // TODO
    });

    // Get like status for a post
    //
    //Future<JsonObject> postsLikeGet(String id) async
    test('test postsLikeGet', () async {
      // TODO
    });

    // Get read receipt for a post
    //
    //Future<JsonObject> postsReceipt(String id) async
    test('test postsReceipt', () async {
      // TODO
    });

    // Update a post with moderation and AI authenticity checks
    //
    // Update a post owned by the caller. Content or media changes require a new authorship disclosure. Conflicts or unavailable classification enter review; prohibited content remains blocked regardless of authorship.
    //
    //Future<Post> postsUpdate(String id, UpdatePostRequest updatePostRequest) async
    test('test postsUpdate', () async {
      // TODO
    });

    // Record a post view event
    //
    //Future<JsonObject> postsView(String id, JsonObject body) async
    test('test postsView', () async {
      // TODO
    });

  });
}

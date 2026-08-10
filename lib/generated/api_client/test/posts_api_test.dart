import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PostsApi
void main() {
  final instance = LythausApiClient().getPostsApi();

  group(PostsApi, () {
    // Delete my comment
    //
    //Future<CommentDeleteResponse> commentsDelete(String commentId, { String idempotencyKey }) async
    test('test commentsDelete', () async {
      // TODO
    });

    // Replace my comment body
    //
    //Future<CommentUpdateResponse> commentsReplace(String commentId, CommentUpdateRequest commentUpdateRequest, { String idempotencyKey }) async
    test('test commentsReplace', () async {
      // TODO
    });

    // Partially update my comment body
    //
    //Future<CommentUpdateResponse> commentsUpdate(String commentId, CommentUpdateRequest commentUpdateRequest, { String idempotencyKey }) async
    test('test commentsUpdate', () async {
      // TODO
    });

    // Create a new post
    //
    // Create a new post.
    //
    //Future<LegacyCreatePostResponse> createPost(CreatePostRequest createPostRequest) async
    test('test createPost', () async {
      // TODO
    });

    // Submit a comment or one-level reply
    //
    // A submission is recorded as under review; it is not immediately published to public comment listings.
    //
    //Future<CommentSubmission> postsCommentsCreate(String postId, CommentCreateRequest commentCreateRequest, { String idempotencyKey }) async
    test('test postsCommentsCreate', () async {
      // TODO
    });

    // List publicly visible comments
    //
    // Only allowed comments are returned. Anonymous callers may read public posts; authenticated callers additionally receive relationship filtering.
    //
    //Future<CommentPage> postsCommentsList(String postId, { String cursor, int limit }) async
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

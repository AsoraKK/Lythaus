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
    // Create a post for the authenticated user. An authorship disclosure is required. Human-authored text may publish after review. AI-assisted text may publish only when its normalised, trimmed body is at most 249 user-perceived Unicode characters and receives the categorical `AI-assisted` label. AI-generated public content is blocked and may exist only in an author-private feedback or appeal state where supported.
    //
    //Future<Post> postsCreate(CreatePostRequest createPostRequest, { String idempotencyKey }) async
    test('test postsCreate', () async {
      // TODO
    });

    // Soft-delete a post owned by the authenticated user
    //
    //Future<PostsDelete200Response> postsDelete(String id, String idempotencyKey) async
    test('test postsDelete', () async {
      // TODO
    });

    // Get a post by ID
    //
    //Future<PostsGet200Response> postsGet(String id, { String idempotencyKey }) async
    test('test postsGet', () async {
      // TODO
    });

    // Replace editable post fields and return the post to review
    //
    //Future<PostRevisionResponse> postsReplace(String id, String idempotencyKey, UpdatePostRequest updatePostRequest) async
    test('test postsReplace', () async {
      // TODO
    });

    // Update a post with moderation and AI authenticity checks
    //
    // Update a post owned by the caller. A body change requires a fresh declaredCreationMode; a visibility-only change preserves the stored declaration. Every accepted update returns the post to review.
    //
    //Future<PostRevisionResponse> postsUpdate(String id, UpdatePostRequest updatePostRequest) async
    test('test postsUpdate', () async {
      // TODO
    });

  });
}

import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for SocialApi
void main() {
  final instance = LythausApiClient().getSocialApi();

  group(SocialApi, () {
    // Block a user
    //
    //Future<RelationChange> blocksCreate(TargetUserRequest targetUserRequest, { String idempotencyKey }) async
    test('test blocksCreate', () async {
      // TODO
    });

    // Unblock a user
    //
    //Future<RelationChange> blocksDelete(String id, { String idempotencyKey }) async
    test('test blocksDelete', () async {
      // TODO
    });

    // List my blocks
    //
    //Future<RelationList> blocksList() async
    test('test blocksList', () async {
      // TODO
    });

    // Bookmark a post
    //
    //Future<BookmarkChange> bookmarksCreate(BookmarkCreateRequest bookmarkCreateRequest, { String idempotencyKey }) async
    test('test bookmarksCreate', () async {
      // TODO
    });

    // Remove a bookmark
    //
    //Future<BookmarkChange> bookmarksDelete(String postId, { String idempotencyKey }) async
    test('test bookmarksDelete', () async {
      // TODO
    });

    // List my private bookmarks
    //
    //Future<BookmarkList> bookmarksList() async
    test('test bookmarksList', () async {
      // TODO
    });

    // Follow a user
    //
    //Future<FollowChange> followsCreate(FollowCreateRequest followCreateRequest, { String idempotencyKey }) async
    test('test followsCreate', () async {
      // TODO
    });

    // Unfollow a user
    //
    //Future<FollowChange> followsDelete(String followedId, { String idempotencyKey }) async
    test('test followsDelete', () async {
      // TODO
    });

    // Mute a user
    //
    //Future<RelationChange> mutesCreate(TargetUserRequest targetUserRequest, { String idempotencyKey }) async
    test('test mutesCreate', () async {
      // TODO
    });

    // Unmute a user
    //
    //Future<RelationChange> mutesDelete(String id, { String idempotencyKey }) async
    test('test mutesDelete', () async {
      // TODO
    });

    // List my mutes
    //
    //Future<RelationList> mutesList() async
    test('test mutesList', () async {
      // TODO
    });

    // Set my current reaction on a post
    //
    //Future<ReactionResponse> postReactionsCreate(String postId, ReactionRequest reactionRequest, { String idempotencyKey }) async
    test('test postReactionsCreate', () async {
      // TODO
    });

    // Remove my current reaction from a post
    //
    //Future<ReactionDeleteResponse> postReactionsDelete(String postId, { String idempotencyKey }) async
    test('test postReactionsDelete', () async {
      // TODO
    });

    // Replace my current reaction on a post
    //
    //Future<ReactionResponse> postReactionsReplace(String postId, ReactionRequest reactionRequest, { String idempotencyKey }) async
    test('test postReactionsReplace', () async {
      // TODO
    });

    // Block a user
    //
    //Future<RelationChange> usersBlockCreate(TargetUserRequest targetUserRequest, { String idempotencyKey }) async
    test('test usersBlockCreate', () async {
      // TODO
    });

    // Follow the path user
    //
    //Future<FollowChange> usersFollowCreate(String id, { String idempotencyKey }) async
    test('test usersFollowCreate', () async {
      // TODO
    });

    // Unfollow the path user
    //
    //Future<FollowChange> usersFollowDelete(String id, { String idempotencyKey }) async
    test('test usersFollowDelete', () async {
      // TODO
    });

    // Get my relationship with a user
    //
    //Future<FollowStatus> usersFollowGet(String id) async
    test('test usersFollowGet', () async {
      // TODO
    });

    // Follow a user
    //
    // Compatibility alias for `POST /follows`.
    //
    //Future<FollowChange> usersFollowLegacyCreate(TargetUserRequest targetUserRequest, { String idempotencyKey }) async
    test('test usersFollowLegacyCreate', () async {
      // TODO
    });

    // Mute a user
    //
    //Future<RelationChange> usersMuteCreate(TargetUserRequest targetUserRequest, { String idempotencyKey }) async
    test('test usersMuteCreate', () async {
      // TODO
    });

  });
}

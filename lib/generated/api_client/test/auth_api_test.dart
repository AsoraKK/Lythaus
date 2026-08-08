import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AuthApi
void main() {
  final instance = LythausApiClient().getAuthApi();

  group(AuthApi, () {
    // Sign in with a verified email identity
    //
    // Creates a Lythaus access and refresh session for a verified email account.
    //
    //Future<EmailSessionResponse> authEmailLogin(EmailLoginRequest emailLoginRequest) async
    test('test authEmailLogin', () async {
      // TODO
    });

    // Validate an invite code
    //
    // Validates an invite code without revealing status details.
    //
    //Future<InviteValidationResponse> authInviteValidate({ String code }) async
    test('test authInviteValidate', () async {
      // TODO
    });

    // Verify authentication token is valid
    //
    //Future<JsonObject> authPing() async
    test('test authPing', () async {
      // TODO
    });

    // Redeem an invite code to activate account
    //
    // Allows an authenticated but inactive user to redeem a valid invite code. On success the user is activated and a fresh token pair is returned.
    //
    //Future<RedeemInviteResponse> authRedeemInvite(RedeemInviteRequest redeemInviteRequest) async
    test('test authRedeemInvite', () async {
      // TODO
    });

    // Rotate a refresh token
    //
    //Future<JsonObject> authRefresh(JsonObject body) async
    test('test authRefresh', () async {
      // TODO
    });

    // Revoke an active session
    //
    //Future<JsonObject> authSessionsRevoke(JsonObject body) async
    test('test authSessionsRevoke', () async {
      // TODO
    });

    // Return the current email-authenticated user
    //
    // Returns the active Lythaus account associated with the bearer session.
    //
    //Future<UserInfoResponse> authUserInfo() async
    test('test authUserInfo', () async {
      // TODO
    });

    // OIDC UserInfo endpoint (POST)
    //
    // POST variant of the UserInfo endpoint for clients that cannot use query strings.
    //
    //Future<UserInfoResponse> authUserInfoPost() async
    test('test authUserInfoPost', () async {
      // TODO
    });

  });
}

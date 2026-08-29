import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AuthApi
void main() {
  final instance = LythausApiClient().getAuthApi();

  group(AuthApi, () {
    // Register, sign in, or resend email verification
    //
    // Registers an email account, signs in a verified account, or resends a verification message. Registration requires a Turnstile token when the production bot-protection gate is enabled.
    //
    //Future<EmailSessionResponse> authEmail(EmailAuthRequest emailAuthRequest) async
    test('test authEmail', () async {
      // TODO
    });

    // Verify an email address with a JSON token
    //
    // Consumes a single-use email-verification token and returns only a private verification state.
    //
    //Future<EmailVerificationResponse> authEmailVerifyPost(EmailVerificationRequest emailVerificationRequest) async
    test('test authEmailVerifyPost', () async {
      // TODO
    });

    // Get the public JWT verification key set
    //
    //Future<AuthJwksGet200Response> authJwksGet() async
    test('test authJwksGet', () async {
      // TODO
    });

    // Revoke all active sessions for the authenticated user
    //
    //Future<AuthLogout200Response> authLogout() async
    test('test authLogout', () async {
      // TODO
    });

    // Complete password reset and revoke existing sessions
    //
    //Future<AuthPasswordResetComplete200Response> authPasswordResetComplete(AuthPasswordResetCompleteRequest authPasswordResetCompleteRequest) async
    test('test authPasswordResetComplete', () async {
      // TODO
    });

    // Request an opaque password reset message
    //
    // Always returns the same neutral state so account existence is not disclosed.
    //
    //Future<AuthPasswordResetRequest202Response> authPasswordResetRequest(AuthPasswordResetRequestRequest authPasswordResetRequestRequest) async
    test('test authPasswordResetRequest', () async {
      // TODO
    });

    // Rotate a refresh token
    //
    //Future<EmailSessionResponse> authRefresh(RefreshSessionRequest refreshSessionRequest) async
    test('test authRefresh', () async {
      // TODO
    });

    // Get the authenticated user's current identity claims
    //
    //Future<AuthUserInfo200Response> authUserInfo() async
    test('test authUserInfo', () async {
      // TODO
    });

  });
}

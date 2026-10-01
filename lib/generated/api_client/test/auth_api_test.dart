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
    //Future<EmailSessionResponse> authEmail(EmailAuthRequest emailAuthRequest, { String xLythausAuthTransport, String idempotencyKey }) async
    test('test authEmail', () async {
      // TODO
    });

    // Verify an email address with a JSON token
    //
    // An intentional POST atomically consumes mailbox proof and establishes the mailbox owner's chosen credential on the existing user ID. GET/HEAD never mutates. Password policy is checked before token consumption; omitted password returns password_setup_required without consuming the link. No automatic session or bearer redirect is issued.
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
    // Native clients may send their refresh credential to revoke sessions even after access-token expiry; bearer-only logout remains supported for deployed clients. Browser clients send cookie-v1 with credentials included, an exact allowed Origin and an empty JSON object. This globally revokes the account's sessions, not only this device, and expires the refresh cookie. Local sign-out or HTTP 401 alone does not prove server revocation during an outage.
    //
    //Future<AuthLogout200Response> authLogout({ String xLythausAuthTransport, AuthLogoutRequest authLogoutRequest }) async
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
    // Valid accepted requests return the same neutral state for known, unknown and restricted accounts. This proves intake only, not provider acceptance or mailbox delivery. Eligible pending or credentialless legacy accounts receive mailbox-owned credential setup on their existing ID. Dependency failures are not reported as delivered mail.
    //
    //Future<AuthPasswordResetRequest202Response> authPasswordResetRequest(AuthPasswordResetRequestRequest authPasswordResetRequestRequest, { String idempotencyKey }) async
    test('test authPasswordResetRequest', () async {
      // TODO
    });

    // Rotate a refresh token
    //
    // Browser cookie-v1 transport requires an allowed Origin, credentials included, and an empty JSON object. Native clients supply the opaque token. Refresh credentials rotate; reused revoked credentials revoke their family.
    //
    //Future<EmailSessionResponse> authRefresh(RefreshSessionRequest refreshSessionRequest, { String xLythausAuthTransport }) async
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

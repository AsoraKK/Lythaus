import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for PasskeysApi
void main() {
  final instance = LythausApiClient().getPasskeysApi();

  group(PasskeysApi, () {
    // List your active passkeys
    //
    // Owner-only names, backup state and timestamps. Public keys, authenticator credential IDs and user handles are omitted.
    //
    //Future<PasskeyCredentialList> listPasskeys(String origin, String xLythausAuthTransport) async
    test('test listPasskeys', () async {
      // TODO
    });

    // Check optional passkey availability
    //
    // Disabled by default. Returns enabled:false without schema access when the feature flag is off. Browser support is checked locally.
    //
    //Future<PasskeyCapability> passkeyCapabilities(String origin, String xLythausAuthTransport) async
    test('test passkeyCapabilities', () async {
      // TODO
    });

    // Start passkey login
    //
    // Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
    //
    //Future<PasskeyChallenge> passkeyLoginOptions(String origin, String xLythausAuthTransport, JsonObject body) async
    test('test passkeyLoginOptions', () async {
      // TODO
    });

    // Verify passkey login
    //
    // Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
    //
    //Future<PasskeySession> passkeyLoginVerify(String origin, String xLythausAuthTransport, PasskeyCeremonyRequest passkeyCeremonyRequest) async
    test('test passkeyLoginVerify', () async {
      // TODO
    });

    // Start passkey maintenance
    //
    // Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
    //
    //Future<PasskeyChallenge> passkeyMaintenanceOptions(String origin, String xLythausAuthTransport, JsonObject body) async
    test('test passkeyMaintenanceOptions', () async {
      // TODO
    });

    // Verify passkey maintenance
    //
    // Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
    //
    //Future<PasskeyMaintenance> passkeyMaintenanceVerify(String origin, String xLythausAuthTransport, PasskeyCeremonyRequest passkeyCeremonyRequest) async
    test('test passkeyMaintenanceVerify', () async {
      // TODO
    });

    // Start passkey register
    //
    // Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.
    //
    //Future<PasskeyChallenge> passkeyRegisterOptions(String origin, String xLythausAuthTransport, PasskeyRegisterOptionsRequest passkeyRegisterOptionsRequest) async
    test('test passkeyRegisterOptions', () async {
      // TODO
    });

    // Verify passkey register
    //
    // Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.
    //
    //Future<PasskeyEnrollment> passkeyRegisterVerify(String origin, String xLythausAuthTransport, PasskeyCeremonyRequest passkeyCeremonyRequest) async
    test('test passkeyRegisterVerify', () async {
      // TODO
    });

    // Rename your passkey
    //
    // Requires a current active owner session.
    //
    //Future<PasskeyRenameResult> renamePasskey(String origin, String xLythausAuthTransport, String passkeyId, PasskeyRenameRequest passkeyRenameRequest) async
    test('test renamePasskey', () async {
      // TODO
    });

    // Remove your passkey
    //
    // Requires the current account password and owner session. Revokes all auth sessions and refresh families, and increments token_version. Email/password and recovery remain available.
    //
    //Future<PasskeyRevokeResult> revokePasskey(String origin, String xLythausAuthTransport, String passkeyId, PasskeyRevokeRequest passkeyRevokeRequest) async
    test('test revokePasskey', () async {
      // TODO
    });

  });
}

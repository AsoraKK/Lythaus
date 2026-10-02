import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';

export const PASSKEY_CHALLENGE_SECONDS = 300;
export const PASSKEY_EVIDENCE_VERSION = 'passkey-evidence-v1';

export interface PasskeyEnvironment {
  PASSKEYS_ENABLED?: string;
  PASSKEY_RP_ID?: string;
  PASSKEY_ALLOWED_ORIGINS?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

export interface PasskeyConfiguration {
  rpId: string;
  origins: string[];
}

export function passkeyConfiguration(env: PasskeyEnvironment): PasskeyConfiguration {
  if (env.PASSKEYS_ENABLED !== 'true') throw new Error('feature_disabled');
  const rpId = env.PASSKEY_RP_ID ?? '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*lythaus\.co$/.test(rpId)) {
    throw new Error('passkeys_not_configured');
  }
  const origins = (env.PASSKEY_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const cors = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim());
  if (origins.length === 0 || origins.some(value => {
    try {
      const url = new URL(value);
      return url.protocol !== 'https:' || url.origin !== value || !cors.includes(value)
        || (url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`));
    } catch { return true; }
  })) throw new Error('passkeys_not_configured');
  return { rpId, origins };
}

export function passkeyOrigin(request: Request, configuration: PasskeyConfiguration): string {
  const origin = request.headers.get('origin');
  if (!origin || !configuration.origins.includes(origin)
    || request.headers.get('x-lythaus-auth-transport') !== 'cookie-v1') {
    throw new Error('auth_origin_not_allowed');
  }
  return origin;
}

export async function passkeyDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function passkeyName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 64
    || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('invalid_passkey_name');
  return value.trim();
}

export function passkeyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,1400}$/.test(value)) throw new Error('passkey_invalid');
  return value;
}

function requireSameOriginClientData(response: RegistrationResponseJSON | AuthenticationResponseJSON): void {
  const encoded = response.response.clientDataJSON;
  const decoded = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))) as { crossOrigin?: boolean; topOrigin?: string };
  if ((decoded.crossOrigin !== undefined && decoded.crossOrigin !== false) || decoded.topOrigin !== undefined) throw new Error('passkey_invalid');
}

export async function registrationOptions(configuration: PasskeyConfiguration, userHandle: string, credentials: WebAuthnCredential[]) {
  return generateRegistrationOptions({
    rpName: 'Lythaus', rpID: configuration.rpId,
    userID: Uint8Array.from(atob(userHandle.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0)),
    userName: 'Lythaus account', attestationType: 'none', timeout: PASSKEY_CHALLENGE_SECONDS * 1000,
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: credentials.map(({ id, transports }) => ({ id, transports })),
  });
}

export async function authenticationOptions(configuration: PasskeyConfiguration, credentials?: WebAuthnCredential[]) {
  return generateAuthenticationOptions({
    rpID: configuration.rpId, userVerification: 'required', timeout: PASSKEY_CHALLENGE_SECONDS * 1000,
    allowCredentials: credentials?.map(({ id, transports }) => ({ id, transports })),
  });
}

export async function verifyPasskeyRegistration(response: RegistrationResponseJSON, challenge: string, origin: string, rpId: string) {
  try {
    requireSameOriginClientData(response);
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge,
      expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257] });
    if (!result.verified || !result.registrationInfo?.userVerified) throw new Error('passkey_invalid');
    return result.registrationInfo;
  } catch { throw new Error('passkey_invalid'); }
}

export async function verifyPasskeyAuthentication(input: {
  response: AuthenticationResponseJSON;
  challenge: string;
  origin: string;
  rpId: string;
  userHandle: string;
  credential: WebAuthnCredential;
  deviceType: 'singleDevice' | 'multiDevice';
  requireUserHandle?: boolean;
}) {
  try {
    requireSameOriginClientData(input.response);
    const userHandle = input.response.response.userHandle;
    if ((userHandle === undefined && input.requireUserHandle !== false)
      || (userHandle !== undefined && userHandle !== input.userHandle)) throw new Error('passkey_invalid');
    const result = await verifyAuthenticationResponse({ response: input.response,
      expectedChallenge: input.challenge, expectedOrigin: input.origin, expectedRPID: input.rpId,
      credential: { ...input.credential, counter: input.deviceType === 'multiDevice' ? 0 : input.credential.counter },
      requireUserVerification: true });
    if (!result.verified || !result.authenticationInfo.userVerified
      || result.authenticationInfo.credentialDeviceType !== input.deviceType) throw new Error('passkey_invalid');
    return result.authenticationInfo;
  } catch { throw new Error('passkey_invalid'); }
}

export function passkeyEvidence(userId: string, action: 'enrolled' | 'maintenance', occurredAt: Date, policyVersion: string) {
  if (!Number.isFinite(occurredAt.getTime()) || !policyVersion) throw new Error('passkey_invalid');
  const period = action === 'maintenance' ? occurredAt.toISOString().slice(0, 7) : 'once';
  return { schemaVersion: PASSKEY_EVIDENCE_VERSION, policyVersion, method: 'passkey',
    sourceKey: `${userId}:strong-auth:${action}:${period}`,
    actionKey: action === 'enrolled' ? 'security.strong_auth_setup' : 'security.strong_auth_maintenance',
    period, periodTimezone: 'UTC', occurredAt: occurredAt.toISOString(), points: 0,
    policyState: 'owner_review_pending' } as const;
}

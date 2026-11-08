import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

interface AccessConfiguration {
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_RECOVERY_AUDIENCE?: string;
}

interface VerifiedAccessConfiguration {
  ACCESS_JWKS_URL: string;
  ACCESS_AUDIENCES: string[];
  ACCESS_TEAM_DOMAIN?: string;
}


interface HumanAccessClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  email?: unknown;
  type?: unknown;
  common_name?: unknown;
}

type HumanAssertionVerifier = (assertion: string, configuration: VerifiedAccessConfiguration) => Promise<HumanAccessClaims>;


async function verifyHumanAssertion(
  assertion: string,
  configuration: VerifiedAccessConfiguration,
): Promise<HumanAccessClaims> {
  const jwks = createRemoteJWKSet(new URL(configuration.ACCESS_JWKS_URL));
  return verifyHumanAccessAssertionWithKeySet(assertion, configuration, jwks);
}

// The production path supplies only the configured Access JWKS. The explicit
// key-set seam lets local tests exercise actual signatures without networking.
export async function verifyHumanAccessAssertionWithKeySet(
  assertion: string,
  configuration: VerifiedAccessConfiguration,
  keySet: JWTVerifyGetKey,
): Promise<HumanAccessClaims> {
  const verified = await jwtVerify(assertion, keySet, {
    algorithms: ['RS256'],
    audience: configuration.ACCESS_AUDIENCES,
    issuer: configuration.ACCESS_TEAM_DOMAIN ? `https://${configuration.ACCESS_TEAM_DOMAIN}` : undefined,
    requiredClaims: ['exp', 'iss', 'aud', 'sub', 'type', 'email'],
  });
  return verified.payload as HumanAccessClaims;
}

export function parseAccessAudiences(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const audiences = value.split(',').map((audience) => audience.trim()).filter(Boolean);
  if (audiences.length === 0 || new Set(audiences).size !== audiences.length) return [];
  return audiences;
}


export interface VerifiedHumanAccessIdentity {
  subject: string;
  email: string;
  expiresAt: number;
}

export async function verifiedHumanAccessIdentity(
  request: Request,
  configuration: AccessConfiguration,
  verifier: HumanAssertionVerifier = verifyHumanAssertion,
): Promise<VerifiedHumanAccessIdentity> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!assertion) throw new Error('access_required');
  const audiences = parseAccessAudiences(configuration.ACCESS_AUDIENCES);
  const expectedAudience = configuration.ACCESS_RECOVERY_AUDIENCE;
  if (!configuration.ACCESS_JWKS_URL || audiences.length === 0 || !configuration.ACCESS_TEAM_DOMAIN
    || !expectedAudience || !audiences.includes(expectedAudience)) {
    throw new Error('access_verification_not_configured');
  }
  try {
    const jwksUrl = new URL(configuration.ACCESS_JWKS_URL);
    const issuerUrl = new URL(`https://${configuration.ACCESS_TEAM_DOMAIN}`);
    if (issuerUrl.protocol !== 'https:' || issuerUrl.pathname !== '/' || issuerUrl.username
      || issuerUrl.password || issuerUrl.port || issuerUrl.search || issuerUrl.hash
      || issuerUrl.host !== configuration.ACCESS_TEAM_DOMAIN
      || jwksUrl.href !== `${issuerUrl.origin}/cdn-cgi/access/certs`) {
      throw new Error('invalid_access_configuration');
    }
  } catch {
    throw new Error('access_verification_not_configured');
  }

  let identity: HumanAccessClaims;
  try {
    identity = await verifier(assertion, {
      ACCESS_JWKS_URL: configuration.ACCESS_JWKS_URL,
      ACCESS_AUDIENCES: [expectedAudience],
      ACCESS_TEAM_DOMAIN: configuration.ACCESS_TEAM_DOMAIN,
    });
  } catch {
    throw new Error('access_assertion_invalid');
  }
  const actualAudiences = Array.isArray(identity.aud) ? identity.aud : [identity.aud];
  if (identity.iss !== `https://${configuration.ACCESS_TEAM_DOMAIN}`
    || actualAudiences.length !== 1 || actualAudiences[0] !== expectedAudience
    || typeof identity.exp !== 'number' || !Number.isFinite(identity.exp)
    || identity.exp <= Date.now() / 1000) throw new Error('access_assertion_invalid');
  if (identity.type !== 'app' || identity.common_name !== undefined) throw new Error('access_token_type_invalid');
  // The existing HMAC helper lowercases and trims. Refuse noncanonical subjects
  // here rather than silently treating two distinct opaque subjects as equal.
  if (typeof identity.sub !== 'string' || !identity.sub.trim() || identity.sub !== identity.sub.trim().toLowerCase()) {
    throw new Error('access_subject_missing');
  }
  if (typeof identity.email !== 'string' || !identity.email.trim() || identity.email !== identity.email.trim()) {
    throw new Error('access_email_missing');
  }
  return { subject: identity.sub, email: identity.email, expiresAt: identity.exp * 1000 };
}

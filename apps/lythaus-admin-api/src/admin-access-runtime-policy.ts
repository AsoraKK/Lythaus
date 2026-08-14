import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AdminActor {
  userId: string;
  role: string;
}

interface AccessConfiguration {
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
}

interface VerifiedAccessConfiguration {
  ACCESS_JWKS_URL: string;
  ACCESS_AUDIENCES: string[];
  ACCESS_TEAM_DOMAIN?: string;
}

type AssertionVerifier = (assertion: string, configuration: VerifiedAccessConfiguration) => Promise<{ sub?: string; email?: string }>;

async function verifyAssertion(assertion: string, configuration: VerifiedAccessConfiguration): Promise<{ sub?: string; email?: string }> {
  const jwks = createRemoteJWKSet(new URL(configuration.ACCESS_JWKS_URL));
  const verified = await jwtVerify(assertion, jwks, {
    audience: configuration.ACCESS_AUDIENCES,
    issuer: configuration.ACCESS_TEAM_DOMAIN ? `https://${configuration.ACCESS_TEAM_DOMAIN}` : undefined,
  });
  return verified.payload as { sub?: string; email?: string };
}

export function parseAccessAudiences(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const audiences = value.split(',').map((audience) => audience.trim()).filter(Boolean);
  if (audiences.length === 0 || new Set(audiences).size !== audiences.length) return [];
  return audiences;
}

export async function verifiedAccessSubject(
  request: Request,
  configuration: AccessConfiguration,
  verifier: AssertionVerifier = verifyAssertion,
): Promise<string> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!assertion) throw new Error('access_required');
  const audiences = parseAccessAudiences(configuration.ACCESS_AUDIENCES);
  if (!configuration.ACCESS_JWKS_URL || audiences.length === 0) throw new Error('access_verification_not_configured');
  try {
    new URL(configuration.ACCESS_JWKS_URL);
  } catch {
    throw new Error('access_verification_not_configured');
  }
  let payload: { sub?: string; email?: string };
  try {
    payload = await verifier(assertion, {
      ACCESS_JWKS_URL: configuration.ACCESS_JWKS_URL,
      ACCESS_AUDIENCES: audiences,
      ACCESS_TEAM_DOMAIN: configuration.ACCESS_TEAM_DOMAIN,
    });
  } catch {
    throw new Error('access_assertion_invalid');
  }
  const subject = payload.sub ?? payload.email;
  if (!subject) throw new Error('access_subject_missing');
  return subject;
}

export function requireActiveAdminMembership(row: { user_id?: unknown; role?: unknown } | undefined): AdminActor {
  if (!row || typeof row.user_id !== 'string' || typeof row.role !== 'string') throw new Error('admin_role_required');
  return { userId: row.user_id, role: row.role };
}

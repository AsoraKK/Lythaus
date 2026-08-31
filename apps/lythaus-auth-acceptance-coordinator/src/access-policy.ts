import { createRemoteJWKSet, jwtVerify } from 'jose';

export async function accessSubject(request: Request, env: { ACCESS_JWKS_URL?: string; ACCESS_AUDIENCES?: string; ACCESS_TEAM_DOMAIN?: string }): Promise<string> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  const audiences = (env.ACCESS_AUDIENCES ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!assertion || !env.ACCESS_JWKS_URL || audiences.length === 0) throw new Error('access_required');
  try {
    const verified = await jwtVerify(assertion, createRemoteJWKSet(new URL(env.ACCESS_JWKS_URL)), {
      audience: audiences,
      issuer: env.ACCESS_TEAM_DOMAIN ? `https://${env.ACCESS_TEAM_DOMAIN}` : undefined,
    });
    const subject = typeof verified.payload.sub === 'string' ? verified.payload.sub : typeof verified.payload.email === 'string' ? verified.payload.email : '';
    if (!subject) throw new Error('access_subject_missing');
    return subject;
  } catch (error) {
    if (error instanceof Error && error.message === 'access_subject_missing') throw error;
    throw new Error('access_assertion_invalid');
  }
}

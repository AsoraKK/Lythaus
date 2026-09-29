import { createLocalJWKSet, importPKCS8, jwtVerify, SignJWT, type JSONWebKeySet } from 'jose';

export const LYTHAUS_ACCESS_TOKEN_ISSUER = 'https://api.lythaus.co';
export const LYTHAUS_ACCESS_TOKEN_AUDIENCE = 'lythaus-app';

export interface Principal {
  userId: string;
  roles: string[];
  tokenVersion: number;
}

export async function signAccessToken(input: {
  userId: string;
  roles?: string[];
  privateKeyPem: string;
  keyId: string;
  tokenVersion?: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const privateKey = await importPKCS8(input.privateKeyPem, 'ES256');
  const expiresInSeconds = input.expiresInSeconds ?? 900;
  return new SignJWT({ roles: input.roles ?? [], tokenVersion: input.tokenVersion ?? 1 })
    .setProtectedHeader({ alg: 'ES256', kid: input.keyId, typ: 'JWT' })
    .setIssuer(LYTHAUS_ACCESS_TOKEN_ISSUER)
    .setAudience(LYTHAUS_ACCESS_TOKEN_AUDIENCE)
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string, jwksJson: string): Promise<Principal> {
  const jwks = createLocalJWKSet(JSON.parse(jwksJson) as JSONWebKeySet);
  const verified = await jwtVerify(token, jwks, {
    algorithms: ['ES256'],
    issuer: LYTHAUS_ACCESS_TOKEN_ISSUER,
    audience: LYTHAUS_ACCESS_TOKEN_AUDIENCE,
    requiredClaims: ['iat', 'exp'],
    maxTokenAge: 900,
  });
  const subject = verified.payload.sub;
  if (!subject) throw new Error('token_subject_missing');
  const roles = Array.isArray(verified.payload.roles)
    ? verified.payload.roles.filter((role): role is string => typeof role === 'string')
    : [];
  const tokenVersion = verified.payload.tokenVersion === undefined ? 1 : verified.payload.tokenVersion;
  if (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion) || tokenVersion < 1) {
    throw new Error('token_version_invalid');
  }
  return { userId: subject, roles, tokenVersion };
}

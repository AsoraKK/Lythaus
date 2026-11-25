import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export async function createAccessIssuer(issuer, audience) {
  const keys = await generateKeyPair('RS256');
  const kid = 'synthetic-cloudflare-access';
  const jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid, alg: 'RS256', use: 'sig' }] };
  return {
    jwks,
    issue(subject) {
      return new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid })
        .setSubject(subject).setAudience(audience).setIssuer(issuer)
        .setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
    },
  };
}

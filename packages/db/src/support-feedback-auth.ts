import { hmacLookup, verifyAccessToken, type Principal } from '../../security/src/index.ts';
import { verifiedAccessSubject } from '../../../apps/lythaus-admin-api/src/admin-access-runtime-policy.ts';

interface SupportAuthConfig {
  JWT_PUBLIC_JWKS?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_SUBJECT_HMAC_KEY?: string;
}
export interface SupportAuthentication {
  member(request: Request): Promise<Principal>;
  owner(request: Request): Promise<string>;
}
export function supportAuthentication(config: SupportAuthConfig, assertionVerifier?: Parameters<typeof verifiedAccessSubject>[2]): SupportAuthentication {
  return Object.freeze({
    async member(request: Request): Promise<Principal> {
      const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token || !config.JWT_PUBLIC_JWKS) throw new Error('support_authentication_required');
      try { return await verifyAccessToken(token, config.JWT_PUBLIC_JWKS); } catch { throw new Error('support_authentication_required'); }
    },
    async owner(request: Request): Promise<string> {
      if (!config.ACCESS_SUBJECT_HMAC_KEY) throw new Error('support_owner_required');
      try { return hmacLookup(await verifiedAccessSubject(request, config, assertionVerifier), config.ACCESS_SUBJECT_HMAC_KEY); }
      catch { throw new Error('support_owner_required'); }
    },
  });
}

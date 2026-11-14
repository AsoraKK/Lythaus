import {rebindInstallConsent} from './admin-subject-rebind-capability.mjs';

const consent=rebindInstallConsent(process.env);
console.log(JSON.stringify(consent?{status:'EXACT_DISABLED_CAPABILITY_INSTALL_CONSENT_VERIFIED',
  sourceMainSha:consent.record.releaseSha,grantSha256:consent.payload.sha256,roleGrantsSha256:consent.payload.roleGrantsSha256,
  expiresAt:consent.record.expiresAt}:{status:'NOT_REQUESTED'}));

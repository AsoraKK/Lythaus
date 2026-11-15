import {rebindInstallConsent} from './admin-subject-rebind-capability.mjs';
import {approvedRebindInstallationConnection} from './resolve-admin-subject-rebind-connection.mjs';

const consent=process.env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON
  ?approvedRebindInstallationConnection(process.env).consent:rebindInstallConsent(process.env);
console.log(JSON.stringify(consent?{status:'EXACT_DISABLED_CAPABILITY_INSTALL_CONSENT_VERIFIED',
  sourceMainSha:consent.record.releaseSha,grantSha256:consent.payload.sha256,roleGrantsSha256:consent.payload.roleGrantsSha256,
  expiresAt:consent.record.expiresAt}:{status:'NOT_REQUESTED'}));

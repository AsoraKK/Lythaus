import { pathToFileURL } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { safeId } from './planetscale-native-restore-contract.mjs';

export function inspectDelivery(env, validateInputsOnly = false) {
  if (env.RESTORE_CHECK_DELIVERY_ONLY !== 'true' || env.RESTORE_CHECK_EXECUTE !== 'false'
    || env.RESTORE_CHECK_APPROVAL_JSON) return 'delivery_request_invalid';

  let pins;
  try { pins = JSON.parse(env.RESTORE_CHECK_PLAN_PINS_JSON); }
  catch { return 'delivery_request_invalid'; }
  if (!pins || Object.keys(pins).length !== 1 || !safeId(pins.expectedTokenId)) return 'delivery_request_invalid';
  if (validateInputsOnly) return 'delivery_inputs_valid';

  if (env.GH_TOKEN || env.PLANETSCALE_SCHEMA_READ_DATABASE_URL) return 'delivery_context_invalid';
  const pair = env.PLANETSCALE_RESTORE_API_TOKEN;
  if (!pair) return 'delivery_input_missing';
  let id;
  try { id = planetScaleServiceTokenAuthorizationHeader(pair).split(':', 1)[0]; }
  catch { return 'delivery_pair_malformed'; }
  if (!safeId(id)) return 'delivery_pair_malformed';
  return id === pins.expectedTokenId ? 'delivery_id_matched' : 'delivery_id_mismatch';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const validate = process.argv[2] === '--validate-inputs';
  const status = inspectDelivery(process.env, validate);
  console.log(JSON.stringify({ operation: 'credential_delivery_only', status, providerAuthenticationAttempted: false }));
  if (status !== (validate ? 'delivery_inputs_valid' : 'delivery_id_matched')) process.exitCode = 1;
}

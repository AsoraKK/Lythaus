import { transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { assertExpectedHostname, correlationId, json, logEvent } from '@lythaus/observability';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import adminWorker from './index.ts';
import { adminCorsPreflight, assertAdminMutationRequest, withAdminCors } from './admin-cors-policy.ts';
import { verifiedAccessSubject } from './admin-access-runtime-policy.ts';
import { rejectUnknownFields, requireConfirmation } from './admin-runtime-policy.ts';
import { readBoundedJson } from './request-body-policy.ts';
import { bootstrapFirstAdmin, FIRST_ADMIN_BOOTSTRAP_CONFIRMATION } from './first-admin-bootstrap.ts';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_ADMIN_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
  ACCESS_AUDIENCES?: string;
}

const BOOTSTRAP_PATH = '/api/admin/bootstrap/first-administrator';

function bootstrapError(error: unknown): { code: string; internalCode: string; status: number } {
  const internalCode = error instanceof Error ? error.message : 'non_error_thrown';
  const statusByCode: Record<string, number> = {
    access_required: 401,
    access_assertion_invalid: 401,
    access_subject_missing: 401,
    access_verification_not_configured: 503,
    admin_subject_key_not_configured: 503,
    bootstrap_binding_unavailable: 503,
    admin_mutation_origin_invalid: 403,
    admin_mutation_content_type_invalid: 415,
    confirmation_required: 409,
    bootstrap_closed: 409,
    invalid_json: 400,
    unknown_field: 400,
    request_too_large: 413,
  };
  if (internalCode === 'bootstrap_transaction_failed') return { code: 'bootstrap_failed', internalCode, status: 500 };
  const status = statusByCode[internalCode];
  return status ? { code: internalCode, internalCode, status } : { code: 'bootstrap_failed', internalCode, status: 500 };
}

async function handleFirstAdminBootstrap(request: Request, env: Env): Promise<Response> {
  const id = correlationId(request);
  const cors = (response: Response) => withAdminCors(request, env.CORS_ALLOWED_ORIGINS, response);
  try {
    assertExpectedHostname(request, env.EXPECTED_HOSTNAMES);
    if (request.method === 'OPTIONS') return adminCorsPreflight(request, env.CORS_ALLOWED_ORIGINS);
    if (request.method !== 'POST') return cors(json({ error: 'not_found', correlationId: id }, { status: 404 }));

    assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
    const body = rejectUnknownFields(
      await readBoundedJson<Record<string, unknown>>(request),
      ['confirmation'],
    );
    requireConfirmation(body.confirmation, FIRST_ADMIN_BOOTSTRAP_CONFIRMATION);

    if (!env.ACCESS_SUBJECT_HMAC_KEY) throw new Error('admin_subject_key_not_configured');
    // The Access application is the identity allowlist. No personal email,
    // subject identifier or product PII key is committed into the bootstrap.
    const verifiedSubject = await verifiedAccessSubject(request, env);
    const accessSubjectHmac = hmacLookup(verifiedSubject, env.ACCESS_SUBJECT_HMAC_KEY);

    const outcome = await bootstrapFirstAdmin(
      { accessSubjectHmac, correlationId: id },
      {
        transaction: (work) => transaction(env.DB_ADMIN_FRESH, work),
        newId: uuidv7,
      },
    );
    return cors(json(outcome, {
      status: 201,
      headers: { 'cache-control': 'private, no-store', 'x-correlation-id': id },
    }));
  } catch (error) {
    const classified = bootstrapError(error);
    logEvent({
      service: 'lythaus-admin-api',
      correlationId: id,
      errorCode: classified.code,
      internalErrorCode: classified.internalCode,
      route: BOOTSTRAP_PATH,
    });
    return cors(json(
      { error: classified.code, correlationId: id },
      { status: classified.status, headers: { 'cache-control': 'private, no-store', 'x-correlation-id': id } },
    ));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === BOOTSTRAP_PATH) {
      return handleFirstAdminBootstrap(request, env);
    }
    return adminWorker.fetch(request, env);
  },
};

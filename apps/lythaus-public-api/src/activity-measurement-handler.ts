import { timingSafeEqual } from 'node:crypto';
import { transaction } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import { activityConsentInput, activityRenderInput, ACTIVITY_NOTICE_VERSION } from '../../../packages/contracts/src/activity-measurement.ts';
import { bindActivityActor, readActivityConsent, setActivityConsent, recordActivityRender, activityConsentResponse } from '../../../packages/db/src/activity-measurement.ts';
import { readBoundedJson } from './request-body-runtime.ts';

type Runner = typeof transaction;
export function isActivityMeasurementPath(path: string): boolean {
  return ['/api/analytics/activity-consent', '/api/analytics/activity'].includes(path);
}

export function activityAccountScope(userId: string, key: string): string {
  if (!key) throw new Error('activity_source_unavailable');
  return hmacLookup(`${ACTIVITY_NOTICE_VERSION}:account-scope:${userId}`, key);
}

export async function handleActivityMeasurement(request: Request, env: EnvBindings, actor: { userId: string }, run: Runner = transaction): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const url = new URL(request.url);
  if (!isActivityMeasurementPath(url.pathname)) return respond({ error: 'not_found' }, 404);
  if (url.search || !['GET', 'PUT', 'POST'].includes(request.method)
    || (url.pathname.endsWith('activity-consent') ? !['GET', 'PUT'].includes(request.method) : request.method !== 'POST')) return respond({ error: 'activity_invalid_request' }, 400);
  try {
    if (!env.DB_APP_FRESH || !env.PII_HMAC_KEY_V1) throw new Error('activity_source_unavailable');
    const scope = activityAccountScope(actor.userId, env.PII_HMAC_KEY_V1);
    const body = request.method === 'GET' ? null : await readBoundedJson(request, 1024);
    const consent = request.method === 'PUT' ? activityConsentInput(body) : null;
    const render = request.method === 'POST' ? activityRenderInput(body) : null;
    const suppliedScope = consent?.accountScope ?? render?.accountScope;
    if (suppliedScope && !timingSafeEqual(Buffer.from(scope), Buffer.from(suppliedScope))) throw new Error('activity_account_scope_changed');
    const result = await run(env.DB_APP_FRESH, async client => {
      await bindActivityActor(client, actor.userId);
      if (consent) return activityConsentResponse(await setActivityConsent(client, { id: uuidv7(), ...consent }), scope);
      if (render) return recordActivityRender(client, render.consentRevision, render.consentEpoch);
      return activityConsentResponse(await readActivityConsent(client), scope);
    });
    return respond(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status: Record<string, number> = { activity_invalid_request: 400, invalid_json: 400, request_too_large: 413,
      unsupported_content_type: 415, activity_account_required: 401, activity_account_scope_changed: 409,
      activity_consent_revision_conflict: 409, activity_consent_required: 409, activity_pilot_disabled: 409 };
    return respond({ error: Object.hasOwn(status, message) ? message : 'activity_source_unavailable' }, status[message] ?? 503);
  }
}

import { transaction } from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { bindActivityActor, readActivitySummary } from '../../../packages/db/src/activity-measurement.ts';

export async function handleActivityMeasurementSummary(request: Request, env: Pick<EnvBindings, 'DB_ADMIN_FRESH'>,
  actor: { userId: string; role: string }, correlationId: string, run = transaction): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (actor.role !== 'owner') return respond({ error: 'activity_owner_required' }, 403);
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/admin/activity-measurement' || url.search) return respond({ error: 'activity_invalid_request' }, 400);
  try {
    if (!env.DB_ADMIN_FRESH) throw new Error('activity_source_unavailable');
    const summary = await run(env.DB_ADMIN_FRESH, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await bindActivityActor(client, actor.userId);
      const result = await readActivitySummary(client);
      await client.query(`INSERT INTO system.audit_events(id, actor_id, action, target_type, correlation_id, metadata)
        VALUES($1,$2,'admin.activity_measurement_read','community',$3,$4::jsonb)`,
      [uuidv7(), actor.userId, correlationId, JSON.stringify({ contractVersion: result.contractVersion, pilotEnabled: result.enabled })]);
      return result;
    });
    return respond(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return respond({ error: ['activity_owner_required', 'activity_account_required'].includes(message) ? 'activity_owner_required' : 'activity_source_unavailable' },
      ['activity_owner_required', 'activity_account_required'].includes(message) ? 403 : 503);
  }
}

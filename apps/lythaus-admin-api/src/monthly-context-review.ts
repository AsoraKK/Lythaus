import { transaction, type HyperdriveBinding } from '@lythaus/db';
import { json } from '@lythaus/observability';
import { recordMonthlyContextReview, type ContextReviewRequest } from '../../../packages/db/src/monthly-context-review.ts';
import { rejectUnknownFields } from './admin-runtime-policy.ts';
import { readBoundedJson } from './request-body-policy.ts';

export async function handleMonthlyContextReview(request: Request, env: {
  DB_ADMIN_FRESH: HyperdriveBinding; MONTHLY_REPUTATION_CONTEXT_RULES?: string;
}, actorId: string, commentId: string): Promise<Response> {
  if (!env.MONTHLY_REPUTATION_CONTEXT_RULES) throw new Error('monthly_context_unavailable');
  const body = rejectUnknownFields(await readBoundedJson(request), [
    'rubricVersion', 'sourceRevisionId', 'threadRevisionId', 'parentRevisionId', 'decision',
    'reasonCode', 'evidenceReference', 'expectedRevision', 'idempotencyKey',
  ]);
  const input = { ...body, commentId, actorId, rulesVersion: env.MONTHLY_REPUTATION_CONTEXT_RULES } as ContextReviewRequest;
  const result = await transaction(env.DB_ADMIN_FRESH, client => recordMonthlyContextReview(client, input));
  return json(result, { status: result.created ? 201 : 200, headers: { 'cache-control': 'private, no-store' } });
}

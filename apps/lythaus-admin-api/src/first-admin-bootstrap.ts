import type { DatabaseClient } from '@lythaus/db';

export const FIRST_ADMIN_BOOTSTRAP_CONFIRMATION = 'BOOTSTRAP FIRST ADMINISTRATOR';

export interface FirstAdminBootstrapDependencies {
  transaction: <T>(work: (client: Pick<DatabaseClient, 'query'>) => Promise<T>) => Promise<T>;
  newId: () => string;
}

export interface FirstAdminBootstrapInput {
  accessSubjectHmac: string;
  correlationId: string;
}

export async function bootstrapFirstAdmin(
  input: FirstAdminBootstrapInput,
  dependencies: FirstAdminBootstrapDependencies,
): Promise<{ created: true; role: 'administrator' }> {
  if (!input.accessSubjectHmac || !input.correlationId) throw new Error('bootstrap_binding_unavailable');

  const principalId = dependencies.newId();
  const auditId = dependencies.newId();
  let created: boolean;
  try {
    created = await dependencies.transaction(async (client) => {
      const result = await client.query<{ created: boolean }>(
        `SELECT identity.bootstrap_first_administrator(
           $1::uuid,
           decode($2, 'base64'),
           $3::uuid,
           $4::text
         ) AS created`,
        [principalId, input.accessSubjectHmac, auditId, input.correlationId],
      );
      if (result.rowCount !== 1 || typeof result.rows[0]?.created !== 'boolean') {
        throw new Error('bootstrap_result_invalid');
      }
      return result.rows[0].created;
    });
  } catch {
    throw new Error('bootstrap_transaction_failed');
  }

  // Returning false is the database's durable, committed closure path. Throw
  // only after the transaction has committed so a stale latch can be repaired
  // to consumed when a membership/audit record already exists.
  if (!created) throw new Error('bootstrap_closed');
  return { created: true, role: 'administrator' };
}

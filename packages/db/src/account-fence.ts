import type { DatabaseClient } from './index.ts';

export async function accountRowLockAvailable(client: DatabaseClient): Promise<boolean> {
  const permission = (await client.query<{ available: boolean }>(`SELECT
    has_table_privilege(current_user, 'identity.users', 'SELECT')
    AND has_any_column_privilege(current_user, 'identity.users', 'UPDATE') AS available`)).rows[0];
  return permission?.available === true;
}

export async function lockActiveAccount(client: DatabaseClient, authorId: string): Promise<'locked' | 'inactive' | 'unavailable'> {
  if (!await accountRowLockAvailable(client)) return 'unavailable';
  const account = (await client.query<{ status: string; deleted_at: string | null }>(
    'SELECT status, deleted_at FROM identity.users WHERE id = $1 FOR SHARE', [authorId],
  )).rows[0];
  return account?.status === 'active' && account.deleted_at === null ? 'locked' : 'inactive';
}

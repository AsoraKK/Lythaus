import type { DatabaseClient } from '@lythaus/db';

/** Relationship changes and feedback visibility must serialize on the same users. */
export async function lockRelationshipUsers(client: DatabaseClient, first: string, second: string): Promise<void> {
  await client.query('SELECT id FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[first, second]]);
}

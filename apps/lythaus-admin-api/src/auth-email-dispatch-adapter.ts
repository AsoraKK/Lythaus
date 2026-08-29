import type { DatabaseClient } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';

export interface AuthEmailDispatchIntent {
  actorId: string;
  correlationId: string;
  kind: 'account_invitation' | 'verification_resend';
  challengeId: string;
  tokenCiphertext: string;
  tokenKeyVersion: string;
  userId: string;
}

export interface AuthEmailDispatchAdapter {
  enqueue(client: DatabaseClient, intent: AuthEmailDispatchIntent): Promise<void>;
}

/** Keeper writes only the canonical core-owned transactional email contract. */
export function createAuthEmailDispatchAdapter(_env: EnvBindings): AuthEmailDispatchAdapter {
  return {
    async enqueue(client, intent) {
      const purpose = intent.kind === 'account_invitation' ? 'invite' : 'verification';
      await client.query(
        `INSERT INTO system.transactional_email_outbox
           (id, purpose, challenge_id, template_version, secret_ciphertext, key_version, state, correlation_id)
         VALUES ($1, $2, $3, 'v1', convert_to($4, 'utf8'), $5, 'pending', $6)`,
        [crypto.randomUUID(), purpose, intent.challengeId, intent.tokenCiphertext, intent.tokenKeyVersion, intent.correlationId],
      );
    },
  };
}

import { enqueueTransactionalEmailIntent, type DatabaseClient } from '@lythaus/db';
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
      await enqueueTransactionalEmailIntent(client, {
        id: crypto.randomUUID(),
        userId: intent.userId,
        contactEmailUserId: intent.userId,
        purpose,
        challengeId: intent.challengeId,
        templateVersion: 'v1',
        secretCiphertext: intent.tokenCiphertext,
        secretEncryptionKeyVersion: intent.tokenKeyVersion,
        correlationId: intent.correlationId,
      });
    },
  };
}

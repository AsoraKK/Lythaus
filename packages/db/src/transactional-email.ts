import type { Client } from 'pg';

export type TransactionalEmailPurpose = 'verification' | 'password_reset' | 'invite' | 'email_change';

export interface TransactionalEmailOutboxInput {
  id: string;
  userId?: string;
  contactEmailUserId?: string;
  purpose: TransactionalEmailPurpose;
  challengeId?: string;
  templateVersion: string;
  secretCiphertext?: string;
  secretEncryptionKeyVersion?: string;
  correlationId: string;
}

/**
 * The single database write path for transactional email intent. Callers must
 * invoke this from the same transaction as the identity mutation.
 */
export async function enqueueTransactionalEmailIntent(client: Client, input: TransactionalEmailOutboxInput): Promise<void> {
  await client.query(
    `INSERT INTO system.transactional_email_outbox
       (id, user_id, contact_email_user_id, purpose, challenge_id, template_version,
        secret_ciphertext, secret_encryption_key_version, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.id,
      input.userId ?? null,
      input.contactEmailUserId ?? input.userId ?? null,
      input.purpose,
      input.challengeId ?? null,
      input.templateVersion,
      input.secretCiphertext ?? null,
      input.secretEncryptionKeyVersion ?? null,
      input.correlationId,
    ],
  );
}

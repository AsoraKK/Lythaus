import {
  transactionWithVerifiedFailureCleanup,
  verifiedTransactionFailureCause,
  isReputationSubjectDeletedError,
  type DatabaseClient,
  type HyperdriveBinding,
} from '@lythaus/db';

export async function runReputationTransaction(
  binding: HyperdriveBinding,
  work: (client: DatabaseClient) => Promise<unknown>,
): Promise<'processed' | 'deleted'> {
  try {
    await transactionWithVerifiedFailureCleanup(binding, work);
    return 'processed';
  } catch (error) {
    const verified = verifiedTransactionFailureCause(error);
    if (!verified || !isReputationSubjectDeletedError(verified.cause)) throw error;
    return 'deleted';
  }
}

import { classifyPublicError } from './auth-runtime-policy.ts';

export interface IdempotencyErrorResponse {
  exposedCode: string;
  internalCode: string;
  status: number;
}

export async function runClaimedIdempotentWork(input: {
  work: () => Promise<Response>;
  finalize: (response: Response) => Promise<void>;
  quarantine: () => Promise<void>;
  errorResponse: (classified: IdempotencyErrorResponse) => Response;
}): Promise<Response> {
  let result: Response;
  try {
    result = await input.work();
  } catch (error) {
    const classified = classifyPublicError(error);
    if (classified.status >= 500) {
      await input.quarantine().catch(() => undefined);
      throw error;
    }
    result = input.errorResponse(classified);
  }

  try {
    await input.finalize(result);
  } catch {
    await input.quarantine().catch(() => undefined);
    throw new Error('idempotency_outcome_unknown');
  }
  return result;
}
